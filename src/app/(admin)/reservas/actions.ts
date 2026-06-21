'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, moneyCents, boundedText } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext, getDb } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'
import {
  createManualBooking,
  completeBooking,
} from '@/modules/bookings/booking.service'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import {
  cancelByAdmin,
  handleNoShow,
  type AdminCancellationType,
} from '@/modules/bookings/booking.cancellation'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import type { CashFlowRow } from '@/modules/cashflow/cashflow.types'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { createManualBookingSchema } from '@/modules/bookings/booking.schema'
import {
  SlotTakenError,
  CourtOfflineError,
  PriceUnavailableError,
  BookingNotInConfirmedError,
  BookingNotYetEndedError,
  BookingNotYetStartedError,
  RefundUnavailableError,
} from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

export type BookingActionResult =
  | { success: true; booking: BookingRow }
  | { success: false; error: string }

export type BookingChargeActionResult =
  | { success: true; cashFlow: CashFlowRow }
  | { success: false; error: string }

export async function createBookingAction(
  data: unknown,
): Promise<BookingActionResult> {
  // Cruce #1: rol leído de DB — solo admin/manager operan reservas.
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // staffUserId is required by the schema but is NOT sent by the client form
  // (BookingFormModal has no way to know the admin's staff_user_id — that's
  // resolved server-side from the session). Merge it in before parsing so the
  // schema validates successfully instead of returning "Required".
  const staffUserId = user.staffUserId
  const dataWithStaff =
    typeof data === 'object' && data !== null
      ? { ...(data as Record<string, unknown>), staffUserId }
      : data

  const parsed = createManualBookingSchema.safeParse(dataWithStaff)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await createManualBooking(
        tenant.id,
        { ...parsed.data, staffUserId },
        tx,
      )
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof SlotTakenError) {
        return { success: false as const, error: 'Este turno acaba de ser tomado.' }
      }
      if (err instanceof CourtOfflineError) {
        return { success: false as const, error: 'La cancha no está disponible.' }
      }
      if (err instanceof PriceUnavailableError) {
        return { success: false as const, error: 'No hay precio configurado para este horario.' }
      }
      throw err
    }
  })

  if (result.success) {
    // Revalidate both the reservas list and the grilla — the grilla is the
    // surface most likely to be open when the admin creates a booking
    // (BookingFormModal is launched from there), so its cached server data
    // would otherwise still show the slot as free even after success.
    revalidatePath('/reservas')
    revalidatePath('/grilla')
  }
  return result
}

// NOTE: detail/action mutations also need to revalidate `/reservas/[id]`.
// revalidatePath('/reservas') alone only invalidates the list page — the
// dynamic detail route keeps its cached server data and router.refresh()
// re-renders the same stale booking. Use a helper to invalidate BOTH.
// La grilla también: una cancelación libera el slot y un cambio de estado
// cambia el color de la celda; sin esto quedaría mostrando datos viejos.
function revalidateBooking(bookingId: string): void {
  revalidatePath('/reservas')
  revalidatePath(`/reservas/${bookingId}`)
  revalidatePath('/grilla')
}

/**
 * Confirmación manual del pago de la seña (el jugador pagó en efectivo o por
 * transferencia fuera de MP). Usa la primitiva race-safe compartida con el
 * webhook de MP: si este perdió la carrera contra el webhook o el cron de
 * expiración, won=false y no se pisa nada.
 */
export async function confirmDepositPaymentAction(
  bookingId: string,
): Promise<BookingActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const r = await transitionFromPendingPayment(bookingId, 'confirmed', tx)
    if (!r.won) {
      return {
        success: false as const,
        error: 'La reserva ya no está pendiente de pago (pudo confirmarse o expirar).',
      }
    }
    return { success: true as const, booking: r.row }
  })

  if (result.success) revalidateBooking(bookingId)
  return result
}

export async function completeBookingAction(
  bookingId: string,
): Promise<BookingActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await completeBooking(bookingId, 'admin', tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      if (err instanceof BookingNotYetEndedError) {
        return {
          success: false as const,
          error: 'El turno todavía no terminó. Podés marcarla completada recién después del horario de fin.',
        }
      }
      throw err
    }
  })

  if (result.success) revalidateBooking(bookingId)
  return result
}

export async function markNoShowAction(
  bookingId: string,
): Promise<BookingActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const staffUserId = user.staffUserId

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await handleNoShow(bookingId, staffUserId, tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      if (err instanceof BookingNotYetStartedError) {
        return {
          success: false as const,
          error: 'El turno todavía no empezó. Podés marcar ausente recién después del horario de inicio.',
        }
      }
      throw err
    }
  })

  if (result.success) revalidateBooking(bookingId)
  return result
}

export async function cancelBookingAction(
  bookingId: string,
  reason: string,
  cancellationType: AdminCancellationType,
): Promise<BookingActionResult> {
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'El motivo debe tener al menos 3 caracteres.' }
  }
  if (cancellationType !== 'complejo' && cancellationType !== 'jugador') {
    return { success: false, error: 'Indicá quién cancela la reserva.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const staffUserId = user.staffUserId

  // El reembolso lo decide el motivo dentro de cancelByAdmin (Tarea #3), no el
  // cliente. Resolvemos el gateway siempre que el complejo tenga MP linkeado,
  // porque ambos motivos pueden terminar en reembolso (complejo siempre;
  // jugador si está dentro del plazo). resolveTenantGateway no hace I/O.
  let gateway: PaymentGateway | null = null
  const db = getDb()
  const rows = await db
    .select({ mpAccessToken: tenants.mpAccessToken })
    .from(tenants)
    .where(eq(tenants.id, tenant.id))
    .limit(1)
  const mpAccessToken = rows[0]?.mpAccessToken
  if (mpAccessToken) {
    gateway = resolveTenantGateway(tenant.id, mpAccessToken)
  }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await cancelByAdmin(bookingId, staffUserId, reason, cancellationType, gateway, tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      // Hallazgo 2: corresponde refund pero MP no está disponible para este complejo.
      if (err instanceof RefundUnavailableError) {
        return {
          success: false as const,
          error: 'No se pudo procesar el reembolso por MercadoPago. Gestionalo manualmente.',
        }
      }
      throw err
    }
  })

  if (result.success) revalidateBooking(bookingId)
  return result
}

const CHARGEABLE_STATUSES = ['confirmed', 'completed', 'no_show'] as const

const addBookingChargeSchema = z.object({
  bookingId: uuid,
  // Cobro de mostrador: siempre positivo. moneyCents admite 0, acá lo excluimos.
  amount: moneyCents.refine((v) => v > 0, 'El monto debe ser mayor a 0.'),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  clientIdempotencyKey: uuid.optional(),
  note: boundedText(200).optional(),
})

export type AddBookingChargeInput = z.input<typeof addBookingChargeSchema>

/**
 * Tarea #8 — "Cobros de turno": registra un pago (parcial o total) del turno en
 * el mostrador como CashFlow income vinculado al booking_id. Reusa createCashFlow
 * (mismo path transaccional: idempotencia + guard de caja cerrada) dentro de
 * withTenantContext, así el cobro queda aislado por tenant y sin duplicados.
 */
export async function addBookingChargeAction(
  input: AddBookingChargeInput,
): Promise<BookingChargeActionResult> {
  const parsed = addBookingChargeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { bookingId, amount, method, clientIdempotencyKey, note } = parsed.data

  const result = await withTenantContext(tenant.id, async (tx) => {
    // El booking tiene que existir en este tenant (RLS) y estar en un estado
    // cobrable: no tiene sentido cobrar un turno cancelado/expirado o pendiente
    // de pago (todavía no hay turno confirmado).
    const bookingRows = await tx.execute(sql`
      SELECT status FROM bookings WHERE id = ${bookingId} LIMIT 1
    `)
    const booking = (bookingRows as unknown as Array<{ status: string }>)[0]
    if (!booking) {
      return { success: false as const, error: 'La reserva no existe.' }
    }
    if (!CHARGEABLE_STATUSES.includes(booking.status as (typeof CHARGEABLE_STATUSES)[number])) {
      return { success: false as const, error: 'No se puede cobrar una reserva en este estado.' }
    }

    try {
      const cashFlow = await createCashFlow(
        tenant.id,
        user.staffUserId,
        {
          type: 'income',
          category: 'booking',
          amount,
          method,
          description: note?.trim() ? note.trim() : 'Cobro de turno',
          bookingId,
          clientIdempotencyKey,
        },
        tx,
      )
      return { success: true as const, cashFlow }
    } catch (err) {
      if (err instanceof DayAlreadyClosedError) {
        return {
          success: false as const,
          error: 'La caja de hoy ya fue cerrada. Registrá el cobro como ajuste en Caja.',
        }
      }
      throw err
    }
  })

  if (result.success) {
    revalidateBooking(bookingId)
    revalidatePath('/caja')
  }
  return result
}
