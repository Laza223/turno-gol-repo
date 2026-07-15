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
import { settleRefund } from '@/modules/payments/payment.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { captureMessage } from '@/lib/sentry'
import { createManualBookingSchema, bookingResponseSchema } from '@/modules/bookings/booking.schema'
import { validateApiOutput } from '@/shared/api-output'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { formatArs } from '@/lib/format'
import { getBookingCharges } from './queries'
import {
  SlotTakenError,
  CourtOfflineError,
  PriceUnavailableError,
  BookingValidationError,
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
      if (err instanceof BookingValidationError) {
        // Tarea #6: turnos de 60 min (los bloques sí pueden durar varias horas).
        return { success: false as const, error: err.message }
      }
      throw err
    }
  })

  if (result.success) {
    validateApiOutput(bookingResponseSchema, { data: result.booking }, 'createBookingAction')
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

  if (result.success) {
    validateApiOutput(bookingResponseSchema, { data: result.booking }, 'confirmDepositPaymentAction')
    revalidateBooking(bookingId)
  }
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

  if (result.success) {
    validateApiOutput(bookingResponseSchema, { data: result.booking }, 'completeBookingAction')
    revalidateBooking(bookingId)
  }
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

  if (result.success) {
    validateApiOutput(bookingResponseSchema, { data: result.booking }, 'markNoShowAction')
    revalidateBooking(bookingId)
  }
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

  const txResult = await withTenantContext(tenant.id, async (tx) => {
    try {
      const outcome = await cancelByAdmin(bookingId, staffUserId, reason, cancellationType, gateway, tx)
      return {
        success: true as const,
        booking: outcome.booking,
        pendingRefund: outcome.pendingRefund,
        notificationIds: outcome.notificationIds,
      }
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

  if (!txResult.success) return txResult

  validateApiOutput(bookingResponseSchema, { data: txResult.booking }, 'cancelBookingAction')
  revalidateBooking(bookingId)

  // doc7 Flujo 4: booking_canceled / booking_canceled_by_complex encolados
  // dentro de la tx (cancelByAdmin) se despachan recién ahora que commiteó. Si
  // el dispatch falla, la cancelación ya es válida —no hay rollback— y el sweep
  // por cron de send-email levanta la notificación 'queued' igual; nunca
  // convertir esto en error para el usuario.
  try {
    await Promise.all(txResult.notificationIds.map((id) => dispatchEmail(id)))
  } catch (err) {
    captureMessage('email dispatch failed after admin cancellation', {
      level: 'warning',
      extra: {
        bookingId,
        tenantId: tenant.id,
        notificationIds: txResult.notificationIds,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }

  // caza-bugs #3: el refund a MP se resuelve DESPUÉS de que la cancelación ya
  // commiteó (prepareRefund solo dejó la fila 'pending' durable dentro de la
  // tx). Si esta llamada falla, la cancelación ya es válida —no hay
  // rollback— pero el refund queda pendiente de resolución manual/retry.
  if (txResult.pendingRefund && gateway) {
    try {
      await settleRefund(txResult.pendingRefund, gateway, tenant.id)
    } catch (err) {
      captureMessage('mp refund settlement failed after admin cancellation', {
        level: 'error',
        extra: {
          bookingId,
          tenantId: tenant.id,
          refundPaymentId: txResult.pendingRefund.refundPaymentId,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  return { success: true, booking: txResult.booking }
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
      SELECT status, price_snapshot AS "priceSnapshot", deposit_amount AS "depositAmount",
             deposit_status AS "depositStatus"
      FROM bookings WHERE id = ${bookingId} LIMIT 1
    `)
    const booking = (bookingRows as unknown as Array<{
      status: string
      priceSnapshot: number
      depositAmount: number
      depositStatus: string
    }>)[0]
    if (!booking) {
      return { success: false as const, error: 'La reserva no existe.' }
    }
    if (!CHARGEABLE_STATUSES.includes(booking.status as (typeof CHARGEABLE_STATUSES)[number])) {
      return { success: false as const, error: 'No se puede cobrar una reserva en este estado.' }
    }

    // ENS-3 (ensayo real): el endpoint aceptaba cobros sin límite contra el
    // saldo pendiente (turno de $100 aceptó $570 y la UI decía "Pagado
    // completo"). La fuente de verdad es la DB, recalculada acá server-side,
    // nunca lo que mande el cliente.
    //
    // Excepción: un reintento con la MISMA clientIdempotencyKey ya insertada
    // (Fix #55, doble-submit/reintento de red) es el MISMO cobro ya aceptado
    // — no hay que re-validar contra un pendiente que ya bajó por ese cobro,
    // o un reintento legítimo se rechazaría por error.
    let alreadyRegistered = false
    if (clientIdempotencyKey) {
      const dup = await tx.execute(sql`
        SELECT 1 FROM cash_flows WHERE client_idempotency_key = ${clientIdempotencyKey} LIMIT 1
      `)
      alreadyRegistered = (dup as unknown[]).length > 0
    }

    if (!alreadyRegistered) {
      // Hallazgo C (TOCTOU, ENS-3 real): dos cobros concurrentes del mismo
      // booking leían el mismo `pending` sin lock y ambos pasaban la
      // validación (turno de $10.000 aceptaba 2×$8.000). Lockear la fila del
      // booking ANTES de leer los charges serializa los cobros: el segundo
      // espera a que el primero commitee su cash_flow y relee el pendiente ya
      // actualizado. Mismo patrón que createDepositPayment
      // (payment.service.ts). Solo en este camino (valida+inserta) — el
      // reintento idempotente (alreadyRegistered) no re-valida el pendiente,
      // así que no necesita el lock.
      //
      // Orden de locks: fila del booking (FOR UPDATE) SIEMPRE antes que el
      // advisory lock diario (`daily_close:${tenantId}`, tomado dentro de
      // createCashFlow → assertDayOpen). Ningún otro caller de createCashFlow
      // invierte ese orden (grep de pg_advisory_xact_lock + FOR UPDATE en
      // cashflow/bookings/payments) — evita deadlock.
      await tx.execute(sql`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`)

      const { chargesTotal } = await getBookingCharges(tenant.id, bookingId, tx)
      const { pending } = summarizeBookingCharges({
        priceSnapshot: booking.priceSnapshot,
        depositAmount: booking.depositAmount,
        depositStatus: booking.depositStatus,
        chargesTotal,
      })
      if (pending <= 0) {
        return { success: false as const, error: 'Este turno ya está pagado por completo.' }
      }
      if (amount > pending) {
        return {
          success: false as const,
          error: `El cobro (${formatArs(amount)}) supera lo pendiente (${formatArs(pending)}).`,
        }
      }
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
