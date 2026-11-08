'use server'

import { revalidatePath } from 'next/cache'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, moneyCents } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import {
  chargeSplitPayment,
  rejectChargeConflict,
  resolveIdempotentCharges,
} from '@/modules/cashflow/cashflow.service'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import {
  undoWriteOffBooking,
  writeOffBooking,
  WRITTEN_OFF_CHARGE_ERROR,
} from '@/modules/bookings/booking.write-off'
import { BookingValidationError } from '@/modules/bookings/booking.errors'
import type { ActionResult } from '@/shared/types/action-result'
import { formatArs } from '@/lib/format'
import { getBookingCharges } from '@/app/(admin)/reservas/queries'

const chargeLineSchema = z.object({
  amount: moneyCents.refine((v) => v > 0, 'El monto debe ser mayor a 0.'),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  /** Cobro por equipo (decisión del dueño 2026-09-25): a qué equipo se atribuye esta línea. */
  team: z.union([z.literal(1), z.literal(2)]).optional(),
})

const chargeDebtSchema = z.object({
  bookingId: uuid,
  charges: z.array(chargeLineSchema).min(1, 'Debes ingresar al menos un cobro.').max(10),
  clientIdempotencyKey: uuid.optional(),
})

export type ChargeDebtInput = z.input<typeof chargeDebtSchema>

export type ChargeDebtResult = { success: true } | { success: false; error: string }

export async function chargeDebtAction(input: ChargeDebtInput): Promise<ChargeDebtResult> {
  const parsed = chargeDebtSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { bookingId, charges, clientIdempotencyKey } = parsed.data
  // El wire habla `team` (mismo nombre que manda el cliente); el service habla
  // `bookingTeam` (nombre calificado de CreateCashFlowInput/SplitCharge).
  const splitCharges = charges.map((c) => ({
    amount: c.amount,
    method: c.method,
    bookingTeam: c.team,
  }))

  const result: ChargeDebtResult = await withTenantContext(tenant.id, async (tx) => {
    // 1. Fetch booking & current charges
    const bookingRes = await tx.execute(
      sql`SELECT price_snapshot AS "priceSnapshot", deposit_amount AS "depositAmount", deposit_status AS "depositStatus", status FROM bookings WHERE id = ${bookingId} AND tenant_id = ${tenant.id}`,
    )
    const booking = (
      bookingRes as unknown as Array<{
        priceSnapshot: number
        depositAmount: number
        depositStatus: string
        status: string
      }>
    )[0]

    if (!booking) {
      return { success: false as const, error: 'No se encontró la reserva.' }
    }
    if (booking.status !== 'completed') {
      return {
        success: false as const,
        error: 'Este turno cambió de estado y ya no se cobra desde acá. Actualizá la página.',
      }
    }

    // 🟡 4 de la revisión de la tanda #319-#324: acá se comparaba el total
    // COMPLETO de `charges` contra el pendiente, sin excluir las líneas ya
    // insertadas por key — el fix que su función hermana
    // (`addBookingChargeAction`, reservas/actions.ts) ya documentaba como
    // corregido y que nunca se propagó hasta acá. Un reintento idéntico se
    // rechazaba con un error falso ("ya no tiene saldo pendiente" / "supera lo
    // pendiente") aunque el cobro hubiera entrado; uno con otro monto caía en
    // el mismo silencio del 🔴 1. Las dos usan ahora la misma fuente única.
    const idempotent = await resolveIdempotentCharges(
      tenant.id,
      splitCharges,
      clientIdempotencyKey,
      tx,
    )
    if (!idempotent.ok) {
      return { success: false as const, error: idempotent.error }
    }
    const newCharging = idempotent.newChargingCents

    if (newCharging > 0) {
      // Hallazgo C (TOCTOU, ENS-3 real, mismo patrón que addBookingChargeAction
      // en reservas/actions.ts): dos cobros concurrentes del mismo booking leían
      // el mismo `pending` sin lock y ambos pasaban la validación. Lockear la
      // fila del booking ANTES de leer los charges serializa los cobros: el
      // segundo espera a que el primero commitee su cash_flow y relee el
      // pendiente ya actualizado. Solo corre cuando hay algo NUEVO para cobrar:
      // un reintento sin líneas nuevas no necesita el lock ni la validación.
      await tx.execute(sql`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`)

      const { chargesTotal, writtenOff } = await getBookingCharges(tenant.id, bookingId, tx)
      const { pending } = summarizeBookingCharges({
        priceSnapshot: booking.priceSnapshot,
        depositAmount: booking.depositAmount,
        depositStatus: booking.depositStatus,
        chargesTotal,
        writtenOff,
      })

      if (pending <= 0) {
        if (writtenOff > 0) {
          return { success: false as const, error: WRITTEN_OFF_CHARGE_ERROR }
        }
        return { success: false as const, error: 'Esta reserva ya no tiene saldo pendiente.' }
      }

      if (newCharging > pending) {
        return {
          success: false as const,
          error: `El cobro total (${formatArs(newCharging)}) supera lo pendiente (${formatArs(pending)}).`,
        }
      }
    }

    // 2. Register each charge line — chargeSplitPayment (D2, Fase 1) es la
    // misma fuente única que usan settleTab/registerInscriptionPayment: una
    // línea por cash_flow, idempotente por separado (`${key}-${i}`).
    await chargeSplitPayment(
      tenant.id,
      user.staffUserId,
      splitCharges,
      (_charge, i) => ({
        type: 'income',
        category: 'booking',
        description:
          charges.length === 1
            ? 'Cobro de deuda atrasada'
            : `Cobro de deuda atrasada (${i + 1}/${charges.length})`,
        bookingId,
      }),
      clientIdempotencyKey,
      tx,
    )

    return { success: true as const }
  }).catch(rejectChargeConflict)

  if (result.success) {
    // `/deudas` era un stub de redirect: revalidarlo no refrescaba ninguna
    // lista real (🟢 de la auditoría 2026-08-01 §7). La lista viva es
    // `/caja/deudas`.
    revalidatePath('/caja/cuentas')
    revalidatePath('/caja')
    revalidatePath('/reservas')
    revalidatePath(`/reservas/${bookingId}`)
  }

  return result
}

const writeOffSchema = z.object({
  bookingId: uuid,
  /** El saldo que vio el staff: si cambió en el medio, se rechaza en vez de resignar otro número. */
  expectedPendingCents: moneyCents.refine((v) => v > 0, 'El monto debe ser mayor a 0.'),
})

export type WriteOffBookingInput = z.input<typeof writeOffSchema>

export type WriteOffBookingResult = ActionResult<{ amount: number }>

/** "Dar por perdido": el staff resigna lo que falta de un turno jugado. Ver `booking.write-off.ts`. */
export async function writeOffBookingAction(
  input: WriteOffBookingInput,
): Promise<WriteOffBookingResult> {
  const parsed = writeOffSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { bookingId, expectedPendingCents } = parsed.data
  // El error de dominio ESCAPA de withTenantContext (rollback real: si el turno
  // se completó en esta tx, no queda completado a medias) y se mapea afuera.
  try {
    const { amount } = await withTenantContext(tenant.id, (tx) =>
      writeOffBooking(tenant.id, user.staffUserId, bookingId, expectedPendingCents, tx),
    )
    revalidateAfterWriteOff(bookingId)
    return { success: true, amount }
  } catch (err) {
    if (err instanceof BookingValidationError) return { success: false, error: err.message }
    throw err
  }
}

export type UndoWriteOffResult = ActionResult

/** Deshace un "Dar por perdido" (la UI solo lo ofrece en el aviso, en el momento). */
export async function undoWriteOffAction(input: {
  bookingId: string
}): Promise<UndoWriteOffResult> {
  const parsed = z.object({ bookingId: uuid }).safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { bookingId } = parsed.data
  try {
    await withTenantContext(tenant.id, (tx) =>
      undoWriteOffBooking(tenant.id, user.staffUserId, bookingId, tx),
    )
  } catch (err) {
    if (err instanceof BookingValidationError) return { success: false, error: err.message }
    throw err
  }
  revalidateAfterWriteOff(bookingId)
  return { success: true }
}

function revalidateAfterWriteOff(bookingId: string): void {
  revalidatePath('/caja/cuentas')
  revalidatePath('/caja')
  revalidatePath('/reservas')
  revalidatePath(`/reservas/${bookingId}`)
}
