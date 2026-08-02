'use server'

import { revalidatePath } from 'next/cache'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, moneyCents } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { formatArs } from '@/lib/format'
import { getBookingCharges } from '../reservas/queries'

const chargeLineSchema = z.object({
  amount: moneyCents.refine((v) => v > 0, 'El monto debe ser mayor a 0.'),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
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

  // Regla de la clase (rediseño Caja/Cantina): el catch va FUERA del contexto
  // transaccional — atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw (acá, las líneas de cobro ya insertadas por el loop). Los
  // returns {success:false} que quedan adentro son validaciones de solo
  // lectura, previas a todo write.
  let result: ChargeDebtResult
  try {
    result = await withTenantContext(tenant.id, async (tx) => {
      // 1. Fetch booking & current charges
      const bookingRes = await tx.execute(
        sql`SELECT price_snapshot AS "priceSnapshot", deposit_amount AS "depositAmount", deposit_status AS "depositStatus", status FROM bookings WHERE id = ${bookingId} AND tenant_id = ${tenant.id}`
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
          error: 'Solo se pueden saldar deudas de reservas completadas.',
        }
      }

      // Hallazgo C (TOCTOU, ENS-3 real, mismo patrón que addBookingChargeAction
      // en reservas/actions.ts): dos cobros concurrentes del mismo booking leían
      // el mismo `pending` sin lock y ambos pasaban la validación. Lockear la
      // fila del booking ANTES de leer los charges serializa los cobros: el
      // segundo espera a que el primero commitee su cash_flow y relee el
      // pendiente ya actualizado.
      //
      // Orden de locks: fila del booking (FOR UPDATE) SIEMPRE antes que el
      // advisory lock diario (`daily_close:${tenantId}`, tomado dentro de
      // createCashFlow → assertDayOpen) — mismo orden que addBookingChargeAction,
      // evita deadlock.
      await tx.execute(sql`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`)

      const { chargesTotal } = await getBookingCharges(tenant.id, bookingId, tx)
      const { pending } = summarizeBookingCharges({
        priceSnapshot: booking.priceSnapshot,
        depositAmount: booking.depositAmount,
        depositStatus: booking.depositStatus,
        chargesTotal,
      })

      if (pending <= 0) {
        return { success: false as const, error: 'Esta reserva ya no tiene saldo pendiente.' }
      }

      const totalCharging = charges.reduce((sum, c) => sum + c.amount, 0)
      if (totalCharging > pending) {
        return {
          success: false as const,
          error: `El cobro total (${formatArs(totalCharging)}) supera lo pendiente (${formatArs(pending)}).`,
        }
      }

      // 2. Register each charge line
      for (let i = 0; i < charges.length; i++) {
        const charge = charges[i]!
        const description =
          charges.length === 1
            ? 'Cobro de deuda atrasada'
            : `Cobro de deuda atrasada (${i + 1}/${charges.length})`

        const lineKey = clientIdempotencyKey ? `${clientIdempotencyKey}-${i}` : undefined

        await createCashFlow(
          tenant.id,
          user.staffUserId,
          {
            type: 'income',
            category: 'booking',
            amount: charge.amount,
            method: charge.method,
            description,
            bookingId,
            clientIdempotencyKey: lineKey,
          },
          tx
        )
      }

      return { success: true as const }
    })
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      return {
        success: false,
        error: 'La caja de hoy ya está cerrada. No se pueden registrar cobros.',
      }
    }
    throw err
  }

  if (result.success) {
    revalidatePath('/deudas')
    revalidatePath('/caja')
    revalidatePath('/reservas')
    revalidatePath(`/reservas/${bookingId}`)
  }

  return result
}
