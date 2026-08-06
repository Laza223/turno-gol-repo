'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, dateStr, hhmm, moneyCents, boundedText } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext, getDb } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { enforce } from '@/shared/rate-limit/apply'
import { tenants } from '@/shared/db/schema'
import {
  createManualBooking,
  completeBooking,
  getAvailableSlots,
} from '@/modules/bookings/booking.service'
import {
  cancelByAdmin,
  handleNoShow,
  handleNoShowRevert,
  type AdminCancellationType,
  type CancellationOutcome,
} from '@/modules/bookings/booking.cancellation'
import { searchTenantPlayers, type PlayerSearchResult } from '@/modules/players/player-search.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import type { CashFlowRow } from '@/modules/cashflow/cashflow.types'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { settleRefund, confirmManualDepositPayment, type ManualDepositMethod } from '@/modules/payments/payment.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { captureMessage, captureException } from '@/lib/sentry'
import {
  createManualBookingSchema,
  rescheduleBookingSchema,
  bookingResponseSchema,
} from '@/modules/bookings/booking.schema'
import {
  rescheduleBooking,
  type RescheduleOutcome,
} from '@/modules/bookings/booking.reschedule'
import { validateApiOutput } from '@/shared/api-output'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { artNowParts, addDays } from '@/shared/dates/art'
import { slotHasPassed } from '@/shared/time/operating-day'
// OJO: hay dos DAY_KEYS exportados con órdenes distintos. Este es el
// domingo-primero, que es el que indexa `Date#getUTCDay()`; el de
// `shared/time/week-days` arranca en lunes y NO sirve para indexar.
import { DAY_KEYS } from '@/lib/booking/grid-cells'
import { formatArs } from '@/lib/format'
import { getBookingCharges } from './queries'
import {
  SlotTakenError,
  CourtOfflineError,
  PriceUnavailableError,
  BookingValidationError,
  BookingNotInConfirmedError,
  BookingNotInNoShowError,
  BookingNotYetEndedError,
  NoShowNotYetEndedError,
  NoShowRevertWindowExpiredError,
  RefundUnavailableError,
  BookingNotReschedulableError,
  BookingDateOutOfRangeError,
} from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

export type BookingActionResult =
  { success: true; booking: BookingRow } | { success: false; error: string }

export type BookingChargeActionResult =
  { success: true; cashFlow: CashFlowRow } | { success: false; error: string }

export async function createBookingAction(data: unknown): Promise<BookingActionResult> {
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

  // Regla de la clase (rediseño Caja/Cantina): el catch va FUERA del contexto
  // transaccional — atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw. Acá los services tiran antes de escribir, pero el patrón
  // uniforme evita que un refactor futuro herede la mina.
  let booking: BookingRow
  try {
    booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(tenant.id, { ...parsed.data, staffUserId }, tx)
    )
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return { success: false, error: 'Este turno acaba de ser tomado.' }
    }
    if (err instanceof CourtOfflineError) {
      return { success: false, error: 'La cancha no está disponible.' }
    }
    if (err instanceof PriceUnavailableError) {
      return { success: false, error: 'No hay precio configurado para este horario.' }
    }
    if (err instanceof BookingValidationError) {
      // Tarea #6: turnos de 60 min (los bloques sí pueden durar varias horas).
      return { success: false, error: err.message }
    }
    throw err
  }

  validateApiOutput(bookingResponseSchema, { data: booking }, 'createBookingAction')
  // Revalidate both the reservas list and the grilla — the grilla is the
  // surface most likely to be open when the admin creates a booking
  // (BookingFormModal is launched from there), so its cached server data
  // would otherwise still show the slot as free even after success.
  revalidatePath('/reservas')
  revalidatePath('/grilla')
  return { success: true, booking }
}

const checkSlotAvailabilitySchema = z.object({
  courtId: uuid,
  date: dateStr,
  timeStart: hhmm,
})

export type CheckSlotAvailabilityInput = z.input<typeof checkSlotAvailabilitySchema>
export type CheckSlotAvailabilityResult = { available: boolean }

/**
 * Chequeo optimista de disponibilidad al ABRIR BookingFormModal (Fase 4 UX):
 * la grilla puede quedar desactualizada si otro admin toma el turno mientras
 * el modal sigue cerrado. La colisión REAL la sigue validando el server en el
 * submit (createManualBooking → checkOverlapOrThrow + EXCLUDE constraint,
 * migr. 041) — esto es 100% aditivo, de solo lectura (reusa getAvailableSlots,
 * el mismo cálculo que ya usan la grilla y el portal público) y NUNCA la
 * fuente de verdad. Ante auth/rate-limit/parseo/DB caídos devuelve
 * available:true: el chequeo optimista jamás debe bloquear el flujo por un
 * fallo propio.
 */
export async function checkSlotAvailabilityAction(
  input: CheckSlotAvailabilityInput
): Promise<CheckSlotAvailabilityResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { available: true }
  const { tenant } = auth

  // Balde propio (adminAvailabilityCheck), NO adminCrud: esta lectura se
  // dispara sola en cada apertura del modal y compartir el límite de 100/60s
  // por tenant dejaría sin cupo a las mutaciones reales de dinero del staff.
  const outcome = await enforce('adminAvailabilityCheck', tenant.id)
  if (!outcome.ok) return { available: true }

  const parsed = checkSlotAvailabilitySchema.safeParse(input)
  if (!parsed.success) return { available: true }
  const { courtId, date, timeStart } = parsed.data

  try {
    const available = await withTenantContext(tenant.id, async (tx) => {
      const slots = await getAvailableSlots(tenant.id, courtId, date, tx)
      const slot = slots.find((s) => s.timeStart === timeStart)
      // Sin match (cancha offline, fuera de horario, día cerrado): no es una
      // colisión — el submit real ya reporta esos casos con su propio error
      // específico (CourtOfflineError, etc.). No bloqueamos por eso acá.
      return slot ? slot.available : true
    })
    return { available }
  } catch (err) {
    captureException(err)
    return { available: true }
  }
}

const searchBookingPlayersSchema = z.object({
  query: z.string().trim().max(120),
})

export type SearchBookingPlayersActionResult =
  { success: true; players: PlayerSearchResult[] } | { success: false; error: string }

/**
 * Autocomplete de jugador registrado para la reserva manual (BookingFormModal,
 * cluster BookingFormModal Wave 3): mismo servicio que el autocomplete de
 * capitán de Torneos (searchTenantPlayers, ver torneos/actions.ts). Balde
 * propio (adminAvailabilityCheck, NO adminCrud) porque se dispara en cada
 * tecleo debounced desde el modal — mismo razonamiento que
 * checkSlotAvailabilityAction arriba: compartir el límite de 100/60s por
 * tenant dejaría sin cupo a las mutaciones reales de dinero del staff.
 */
export async function searchBookingPlayersAction(
  input: unknown
): Promise<SearchBookingPlayersActionResult> {
  const parsed = searchBookingPlayersSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const outcome = await enforce('adminAvailabilityCheck', tenant.id)
  if (!outcome.ok) {
    return { success: false, error: 'Demasiadas búsquedas. Esperá un momento.' }
  }

  const players = await withTenantContext(tenant.id, (tx) =>
    searchTenantPlayers(tenant.id, parsed.data.query, tx)
  )

  return { success: true, players }
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

const confirmDepositPaymentSchema = z.object({
  method: z.enum(['cash', 'transfer', 'other']),
})

/**
 * Confirmación manual del pago de la seña (el jugador pagó en efectivo,
 * transferencia u otro medio fuera de MP; el staff elige cuál). Usa
 * `confirmManualDepositPayment` (payment.service.ts), que comparte con el
 * webhook de MP la primitiva race-safe `transitionFromPendingPayment`: si
 * este perdió la carrera contra el webhook o el cron de expiración, won=false
 * y no se pisa nada. Además corrige `payment_method`/`payment_id` (el jugador
 * puede haber arrancado y abandonado un checkout de MP antes de que el staff
 * confirmara el cobro en efectivo — sin esta corrección, `payment_id` sigue
 * apuntando a un pago MP nunca aprobado y una cancelación posterior revienta
 * con `RefundInvalidStateError`) y registra el cash_flow de la seña.
 */
export async function confirmDepositPaymentAction(
  bookingId: string,
  method: ManualDepositMethod,
): Promise<BookingActionResult> {
  const parsed = confirmDepositPaymentSchema.safeParse({ method })
  if (!parsed.success) {
    return { success: false, error: 'Indicá cómo se cobró la seña.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const outcome = await withTenantContext(tenant.id, (tx) =>
    confirmManualDepositPayment(bookingId, parsed.data.method, user.staffUserId, tenant.id, tx)
  )

  if (!outcome.won) {
    return {
      success: false,
      error: 'La reserva ya no está pendiente de pago (pudo confirmarse o expirar).',
    }
  }

  validateApiOutput(bookingResponseSchema, { data: outcome.booking }, 'confirmDepositPaymentAction')
  revalidateBooking(bookingId)

  // Mismo patrón que otros dispatches post-commit en este archivo (ej.
  // dispatchEmail en cancelBookingAction): si la caja del día ya estaba
  // cerrada, confirmManualDepositPayment encoló la notificación
  // admin_deposit_after_close DENTRO de la tx — se despacha recién ahora que
  // commiteó. La confirmación del booking ya es válida sin importar si esto falla.
  if (outcome.notificationIds.length > 0) {
    try {
      await Promise.all(outcome.notificationIds.map((id) => dispatchEmail(id)))
    } catch (err) {
      captureMessage('email dispatch failed after manual deposit confirmation', {
        level: 'warning',
        extra: {
          bookingId,
          tenantId: tenant.id,
          notificationIds: outcome.notificationIds,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  return { success: true, booking: outcome.booking }
}

export async function completeBookingAction(bookingId: string): Promise<BookingActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let booking: BookingRow
  try {
    booking = await withTenantContext(tenant.id, (tx) =>
      completeBooking(bookingId, 'admin', tx, user.staffUserId)
    )
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return { success: false, error: 'La reserva no está en estado confirmado.' }
    }
    if (err instanceof BookingNotYetEndedError) {
      return {
        success: false,
        error:
          'El turno todavía no terminó. Podés marcarla completada recién después del horario de fin.',
      }
    }
    throw err
  }

  validateApiOutput(bookingResponseSchema, { data: booking }, 'completeBookingAction')
  revalidateBooking(bookingId)
  return { success: true, booking }
}

export async function markNoShowAction(bookingId: string): Promise<BookingActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const staffUserId = user.staffUserId

  let booking: BookingRow
  try {
    booking = await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staffUserId, tx))
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return { success: false, error: 'La reserva no está en estado confirmado.' }
    }
    if (err instanceof NoShowNotYetEndedError) {
      return {
        success: false,
        error:
          'El turno todavía no terminó. Podés marcar ausente recién después del horario de fin.',
      }
    }
    throw err
  }

  validateApiOutput(bookingResponseSchema, { data: booking }, 'markNoShowAction')
  revalidateBooking(bookingId)
  return { success: true, booking }
}

/**
 * Corrección inversa (RI #1, doc6 §3): deshacer un "No vino" marcado por error,
 * dentro de las 24h. Devuelve el turno a `completed`, revierte el strike de
 * ausencias y levanta el softban si lo había disparado ese strike.
 *
 * La seña capturada NO se reembolsa automáticamente — la UI lo avisa antes de
 * confirmar y queda en el audit_log.
 */
export async function revertNoShowAction(bookingId: string): Promise<BookingActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const staffUserId = user.staffUserId

  // Regla de la clase (caja/actions.ts:107): el catch va FUERA del contexto
  // transaccional. Atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw — acá eso dejaría el booking en 'completed' con el strike
  // sin revertir.
  let booking: BookingRow
  try {
    booking = await withTenantContext(tenant.id, (tx) =>
      handleNoShowRevert(bookingId, staffUserId, tx),
    )
  } catch (err) {
    if (err instanceof BookingNotInNoShowError) {
      return { success: false, error: 'La reserva no está marcada como ausente.' }
    }
    if (err instanceof NoShowRevertWindowExpiredError) {
      return {
        success: false,
        error: 'Pasaron más de 24hs desde que se marcó la ausencia: ya no se puede deshacer.',
      }
    }
    throw err
  }

  validateApiOutput(bookingResponseSchema, { data: booking }, 'revertNoShowAction')
  revalidateBooking(bookingId)
  return { success: true, booking }
}

export async function cancelBookingAction(
  bookingId: string,
  reason: string,
  cancellationType: AdminCancellationType
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

  let outcome: CancellationOutcome
  try {
    outcome = await withTenantContext(tenant.id, (tx) =>
      cancelByAdmin(bookingId, staffUserId, reason, cancellationType, gateway, tx)
    )
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return { success: false, error: 'La reserva no está en estado confirmado.' }
    }
    // Hallazgo 2: corresponde refund pero MP no está disponible para este complejo.
    if (err instanceof RefundUnavailableError) {
      return {
        success: false,
        error: 'No se pudo procesar el reembolso por MercadoPago. Gestionalo manualmente.',
      }
    }
    throw err
  }

  validateApiOutput(bookingResponseSchema, { data: outcome.booking }, 'cancelBookingAction')
  revalidateBooking(bookingId)

  // doc7 Flujo 4: booking_canceled / booking_canceled_by_complex encolados
  // dentro de la tx (cancelByAdmin) se despachan recién ahora que commiteó. Si
  // el dispatch falla, la cancelación ya es válida —no hay rollback— y el sweep
  // por cron de send-email levanta la notificación 'queued' igual; nunca
  // convertir esto en error para el usuario.
  try {
    await Promise.all(outcome.notificationIds.map((id) => dispatchEmail(id)))
  } catch (err) {
    captureMessage('email dispatch failed after admin cancellation', {
      level: 'warning',
      extra: {
        bookingId,
        tenantId: tenant.id,
        notificationIds: outcome.notificationIds,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }

  // caza-bugs #3: el refund a MP se resuelve DESPUÉS de que la cancelación ya
  // commiteó (prepareRefund solo dejó la fila 'pending' durable dentro de la
  // tx). Si esta llamada falla, la cancelación ya es válida —no hay
  // rollback— pero el refund queda pendiente de resolución manual/retry.
  if (outcome.pendingRefund && gateway) {
    try {
      await settleRefund(outcome.pendingRefund, gateway, tenant.id)
    } catch (err) {
      captureMessage('mp refund settlement failed after admin cancellation', {
        level: 'error',
        extra: {
          bookingId,
          tenantId: tenant.id,
          refundPaymentId: outcome.pendingRefund.refundPaymentId,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  return { success: true, booking: outcome.booking }
}

const listRescheduleSlotsSchema = z.object({
  courtId: uuid,
  date: dateStr,
})

export type RescheduleSlot = {
  timeStart: string
  timeEnd: string
  /** Centavos ARS; null = la franja no tiene precio configurado. */
  price: number | null
  available: boolean
}

export type ListRescheduleSlotsResult =
  | {
      success: true
      slots: RescheduleSlot[]
      /** Ventana de fechas que el complejo permite, para acotar el input de fecha. */
      minDate: string
      maxDate: string
    }
  | { success: false; error: string }

/**
 * Huecos a los que se puede MOVER un turno (Fase 3, panel de la grilla).
 *
 * `getAvailableSlots` sabe de horarios, día operativo, cancha offline y
 * ocupación, pero NO de la ventana de anticipación ni de la hora actual — las
 * dos se aplican acá, que es "el caller" del que habla el contrato:
 *
 *  - pasado: mismo predicado que pinta la grilla (`slotHasPassed`), no una
 *    comparación de strings propia. Si divergieran, el panel ofrecería mover un
 *    turno a un hueco que la grilla ya muestra como transcurrido.
 *  - anticipación: se devuelve como `maxDate` para acotar el selector. Es
 *    conveniencia de UI, no la defensa — `rescheduleBooking` revalida la
 *    ventana server-side con `assertDateWindow`.
 *
 * El slot que ocupa el propio turno vuelve como `available: false` (se ocupa a
 * sí mismo): el panel lo etiqueta "actual" en vez de esconderlo.
 */
export async function listRescheduleSlotsAction(
  input: unknown,
): Promise<ListRescheduleSlotsResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  // Mismo balde que el chequeo de disponibilidad del modal (NO adminCrud): es
  // una lectura que se dispara al tocar cada fecha/cancha del selector y no
  // debe comerse el cupo de las mutaciones de plata.
  const outcome = await enforce('adminAvailabilityCheck', tenant.id)
  if (!outcome.ok) return { success: false, error: 'Demasiadas consultas. Probá en unos segundos.' }

  const parsed = listRescheduleSlotsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const { courtId, date } = parsed.data

  const now = artNowParts()
  const maxAdvanceDays = tenant.settings.booking_advance_days ?? 6
  const minDate = now.date
  const maxDate = addDays(now.date, maxAdvanceDays)
  if (date < minDate || date > maxDate) {
    return { success: true, slots: [], minDate, maxDate }
  }

  const dayKey = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!
  const openHhmm =
    tenant.openingHours[dayKey as keyof typeof tenant.openingHours]?.open ?? '08:00'

  try {
    const raw = await withTenantContext(tenant.id, (tx) =>
      getAvailableSlots(tenant.id, courtId, date, tx),
    )
    // Una sola pasada: filtrar los pasados y proyectar el shape de la respuesta
    // en el mismo recorrido (`.filter().map()` recorría la lista dos veces).
    const slots: RescheduleSlot[] = []
    for (const s of raw) {
      const pasado = slotHasPassed({
        date,
        timeStart: s.timeStart,
        openHhmm,
        closesNextDay: tenant.closesNextDay,
        nowDate: now.date,
        nowTime: now.time,
      })
      if (pasado) continue
      slots.push({
        timeStart: s.timeStart,
        timeEnd: s.timeEnd,
        price: s.price,
        available: s.available,
      })
    }
    return { success: true, slots, minDate, maxDate }
  } catch (err) {
    captureException(err)
    return { success: false, error: 'No pudimos cargar los horarios. Probá de nuevo.' }
  }
}

export type RescheduleBookingActionInput = z.input<typeof rescheduleBookingSchema>

export type RescheduleBookingActionResult =
  | { success: true; booking: BookingRow; priceChanged: boolean }
  | { success: false; error: string }

/**
 * Reprogramar un turno (Fase 3): moverlo a otra cancha, otro día u otro horario
 * sin cancelarlo. Conserva el id, la seña y los cobros ya hechos. El precio se
 * recalcula a la franja destino salvo que venga un `priceOverride` explícito.
 *
 * `staffUserId` se mergea server-side: quién reprograma sale de la sesión, no
 * del cliente.
 */
export async function rescheduleBookingAction(
  input: Omit<RescheduleBookingActionInput, 'staffUserId'>,
): Promise<RescheduleBookingActionResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = rescheduleBookingSchema.safeParse({
    ...input,
    staffUserId: user.staffUserId,
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  // El try/catch va FUERA de withTenantContext: atraparlo adentro y devolver un
  // objeto commitearía lo escrito antes del throw.
  let outcome: RescheduleOutcome
  try {
    outcome = await withTenantContext(tenant.id, (tx) =>
      rescheduleBooking(tenant.id, parsed.data, tx),
    )
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return { success: false, error: 'Ese horario acaba de ocuparse. Elegí otro.' }
    }
    if (err instanceof BookingNotReschedulableError) {
      return {
        success: false,
        error:
          err.reason === 'not_a_player_booking'
            ? 'Los bloqueos y las horas de torneo se gestionan desde su propia pantalla.'
            : err.reason === 'deposit_pending'
              ? 'Este turno tiene una seña esperando pago. Esperá a que se acredite o venza antes de moverlo.'
              : err.reason === 'price_below_paid'
                ? 'Ese horario vale menos de lo que el cliente ya pagó. Cancelá el turno y devolvé la diferencia en vez de moverlo.'
                : 'Solo se pueden mover turnos que todavía no se jugaron ni se cancelaron.',
      }
    }
    if (err instanceof BookingDateOutOfRangeError) {
      return {
        success: false,
        error:
          err.reason === 'advance_exceeded'
            ? 'Esa fecha excede la anticipación que permite el complejo.'
            : 'No se puede mover un turno a una fecha pasada.',
      }
    }
    if (err instanceof CourtOfflineError) {
      return { success: false, error: 'La cancha no está disponible.' }
    }
    if (err instanceof PriceUnavailableError) {
      return { success: false, error: 'No hay precio configurado para ese horario.' }
    }
    if (err instanceof BookingValidationError) {
      return { success: false, error: err.message }
    }
    throw err
  }

  validateApiOutput(bookingResponseSchema, { data: outcome.booking }, 'rescheduleBookingAction')
  revalidateBooking(parsed.data.bookingId)

  // El aviso al jugador se encoló dentro de la tx y se despacha recién ahora.
  // Si falla, el turno YA se movió: nunca convertirlo en error para el usuario
  // (el sweep de send-email levanta la notificación 'queued' igual).
  try {
    await Promise.all(outcome.notificationIds.map((id) => dispatchEmail(id)))
  } catch (err) {
    captureMessage('email dispatch failed after reschedule', {
      level: 'warning',
      extra: {
        bookingId: parsed.data.bookingId,
        tenantId: tenant.id,
        notificationIds: outcome.notificationIds,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }

  return { success: true, booking: outcome.booking, priceChanged: outcome.priceChanged }
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
  input: AddBookingChargeInput
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

  // Los returns {success:false} de adentro son validaciones de solo lectura
  // (nada escrito antes) — el único throw con potencial de write previo
  // (DayAlreadyClosedError de createCashFlow) se mapea AFUERA para que la tx
  // rollbackee en vez de commitear.
  let result: BookingChargeActionResult
  try {
    result = await withTenantContext(tenant.id, async (tx) => {
      // El booking tiene que existir en este tenant (RLS) y estar en un estado
      // cobrable: no tiene sentido cobrar un turno cancelado/expirado o pendiente
      // de pago (todavía no hay turno confirmado).
      const bookingRows = await tx.execute(sql`
      SELECT status, price_snapshot AS "priceSnapshot", deposit_amount AS "depositAmount",
             deposit_status AS "depositStatus"
      FROM bookings WHERE id = ${bookingId} LIMIT 1
    `)
      const booking = (
        bookingRows as unknown as Array<{
          status: string
          priceSnapshot: number
          depositAmount: number
          depositStatus: string
        }>
      )[0]
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
        tx
      )
      return { success: true as const, cashFlow }
    })
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      return {
        success: false,
        error: 'La caja de hoy ya fue cerrada. Registrá el cobro como ajuste en Caja.',
      }
    }
    throw err
  }

  if (result.success) {
    revalidateBooking(bookingId)
    revalidatePath('/caja')
  }
  return result
}

// ─── completeAndChargeBookingAction ─────────────────────────────────
// Unified "Complete + Charge" flow: completes the booking and registers
// N split charges in a single transaction. Used by CompleteBookingDialog.

const chargeLineSchema = z.object({
  amount: moneyCents.refine((v) => v > 0, 'El monto debe ser mayor a 0.'),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
})

const completeAndChargeSchema = z.object({
  bookingId: uuid,
  charges: z.array(chargeLineSchema).max(10),
  debtNote: boundedText(500).optional(),
  clientIdempotencyKey: uuid.optional(),
})

export type CompleteAndChargeInput = z.input<typeof completeAndChargeSchema>

export type CompleteAndChargeResult =
  { success: true; booking: BookingRow } | { success: false; error: string }

export async function completeAndChargeBookingAction(
  input: CompleteAndChargeInput
): Promise<CompleteAndChargeResult> {
  const parsed = completeAndChargeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { bookingId, charges, debtNote, clientIdempotencyKey } = parsed.data

  // Bug de la clase (rediseño Caja/Cantina, verificado contra Postgres):
  // atrapar una excepción de dominio ADENTRO del callback y devolver
  // {success:false} hace que drizzle COMMITEE la tx — acá completeBooking ya
  // escribió status='completed' (y el loop pudo insertar cobros parciales),
  // así que el admin veía un error mientras la completación quedaba persistida
  // a medias. Todo error de dominio ahora ESCAPA de withTenantContext (rollback
  // real) y se mapea a mensaje amigable afuera. La validación de "supera lo
  // pendiente" tira BookingValidationError por el mismo motivo: un return
  // commiteaba el complete sin los cobros.
  let booking: BookingRow
  try {
    booking = await withTenantContext(tenant.id, async (tx) => {
      // 1. Complete the booking (validates ends_at, status)
      const completed = await completeBooking(bookingId, 'admin', tx, user.staffUserId)

      // 2. Validate total charges don't exceed pending amount
      if (charges.length > 0) {
        // Hallazgo C (TOCTOU, ENS-3 real, mismo patrón que addBookingChargeAction
        // más arriba en este archivo): la lectura de charges tiene que ocurrir
        // DESPUÉS de lockear la fila. completeBooking() de arriba ya lo hace
        // implícitamente (su UPDATE ... WHERE status='confirmed' toma el row
        // lock y lo mantiene hasta el commit de esta tx) — el FOR UPDATE acá es
        // explícito y redundante a propósito: documenta la dependencia y blinda
        // el código si completeBooking() dejara de hacer ese UPDATE. Mismo
        // orden de locks que addBookingChargeAction: booking FOR UPDATE antes
        // que el advisory lock diario de createCashFlow → assertDayOpen.
        await tx.execute(sql`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`)

        const { chargesTotal } = await getBookingCharges(tenant.id, bookingId, tx)
        const { pending } = summarizeBookingCharges({
          priceSnapshot: completed.priceSnapshot,
          depositAmount: completed.depositAmount,
          depositStatus: completed.depositStatus,
          chargesTotal,
        })

        const totalCharging = charges.reduce((sum, c) => sum + c.amount, 0)
        if (totalCharging > pending) {
          throw new BookingValidationError(
            `El cobro total (${formatArs(totalCharging)}) supera lo pendiente (${formatArs(pending)}).`
          )
        }

        // 3. Register each charge as a cash_flow
        for (let i = 0; i < charges.length; i++) {
          const charge = charges[i]!
          const description =
            charges.length === 1 ? 'Cobro de turno' : `Cobro de turno (${i + 1}/${charges.length})`

          // Unique idempotency key per charge line (derived from the base key)
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
      }

      // 4. If there's a debt note, save it in notes_internal
      if (debtNote?.trim()) {
        const existingNotes = completed.notesInternal ?? ''
        const newNote = existingNotes
          ? `${existingNotes}\n[Deuda] ${debtNote.trim()}`
          : `[Deuda] ${debtNote.trim()}`
        await tx.execute(
          sql`UPDATE bookings SET notes_internal = ${newNote} WHERE id = ${bookingId}`
        )
      }

      return completed
    })
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return { success: false, error: 'La reserva no está en estado confirmado.' }
    }
    if (err instanceof BookingNotYetEndedError) {
      return {
        success: false,
        error:
          'El turno todavía no terminó. Podés marcarla completada recién después del horario de fin.',
      }
    }
    if (err instanceof BookingValidationError) {
      return { success: false, error: err.message }
    }
    if (err instanceof DayAlreadyClosedError) {
      return {
        success: false,
        error: 'La caja de hoy ya fue cerrada. Registrá el cobro como ajuste en Caja.',
      }
    }
    throw err
  }

  validateApiOutput(bookingResponseSchema, { data: booking }, 'completeAndChargeBookingAction')
  revalidateBooking(bookingId)
  revalidatePath('/caja')
  return { success: true, booking }
}
