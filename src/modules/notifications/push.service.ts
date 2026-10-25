/**
 * Push notification dispatch service (admin-facing).
 *
 * - notifyAdminPush(tenantId, payload): loads all push_subscriptions for the
 *   tenant via service role (no RLS, no tenant context required), enqueues 1
 *   pg-boss QUEUE_PUSH_SEND job per subscription.
 * - Skips silently if no subscriptions found (admin has not opted in).
 * - MUST be called AFTER the parent transaction commits (same pattern as
 *   dispatchEmail). pg-boss send is at-least-once — retryLimit=3 puede
 *   re-entregar un job tras un crash/error POST-envío. F3 (hallazgo D4 🔴):
 *   los pushes con evento identificable (reserva confirmada/cancelada, resumen
 *   diario, MP desconectado, plan SaaS — ver `dedupeKeyFor`) llevan una
 *   dedupeKey determinística que el worker reclama vía INSERT ... ON CONFLICT
 *   DO NOTHING en push_send_log ANTES de enviar (push.worker.ts) — así un retry
 *   no duplica el push visible al admin. Otros payloads (ej. el push de test de
 *   /api/admin/push/test, vía notifyStaffPush) NO llevan dedupeKey y siguen
 *   siendo at-least-once sin guard.
 */

import { sql as drizzleSql } from 'drizzle-orm'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import {
  PUSH_SEND_SEND_OPTIONS,
  QUEUE_PUSH_SEND,
  type PushSendJobData,
} from '@/shared/jobs/definitions'
import { pushSendOptions } from './push-quiet-hours'
import {
  BOOKING_CANCELED_PUSH_TYPE,
  PLAN_PUSH_PREFIX,
  bookingCanceledPayload,
  planPushPayload,
  type PlanPushEvent,
} from './push-payloads'
import type { StaffRole } from '@/modules/staff/roles'
import { logger } from '@/shared/lib/logger'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

export type AdminPushPayload = PushSendJobData['payload']

/**
 * Clave determinística de idempotencia por (evento, suscripción): el worker la
 * reclama en `push_send_log` antes de enviar. `undefined` = sin guard (at-least-once).
 */
function dedupeKeyFor(
  tenantId: string,
  payload: AdminPushPayload,
  subscriptionId: string,
): string | undefined {
  if (payload.type === 'booking.confirmed_online' && payload.bookingId) {
    return `push:booking-confirmed:${payload.bookingId}:${subscriptionId}`
  }
  if (payload.type === BOOKING_CANCELED_PUSH_TYPE && payload.bookingId) {
    return `push:booking-canceled:${payload.bookingId}:${subscriptionId}`
  }
  if (payload.type === 'daily_summary' && payload.date) {
    return `push:daily-summary:${tenantId}:${payload.date}:${subscriptionId}`
  }
  // MercadoPago desconectado (mp-connection.service): un aviso por transición,
  // identificada por el instante de la marca.
  if (payload.type === 'mp_disconnected' && typeof payload.disconnectedAt === 'string') {
    return `push:mp-disconnected:${tenantId}:${payload.disconnectedAt}:${subscriptionId}`
  }
  // Plan SaaS: `dedupeId` identifica la instancia del evento (ver push-payloads.ts).
  if (payload.type.startsWith(PLAN_PUSH_PREFIX) && typeof payload.dedupeId === 'string') {
    return `push:${payload.type}:${tenantId}:${payload.dedupeId}:${subscriptionId}`
  }
  return undefined
}

export async function notifyAdminPush(
  tenantId: string,
  payload: AdminPushPayload,
  // Mismo criterio que `enqueueTenantOwnerNotification`: sin filtro va a TODO el
  // staff con push. `onlyRole: 'admin'` es para plata y facturación, que el
  // encargado no ve en la app (`requireAdminStaffAction`).
  opts?: { onlyRole?: StaffRole },
): Promise<{ enqueued: number }> {
  const sql = getWorkerSql()
  const roleFilter = opts?.onlyRole
    ? sql`AND EXISTS (
        SELECT 1 FROM tenant_staff_members tsm
        WHERE tsm.tenant_id = ps.tenant_id
          AND tsm.staff_user_id = ps.staff_user_id
          AND tsm.is_active = true
          AND tsm.role = ${opts.onlyRole}
      )`
    : sql``
  const subs = await sql<{ id: string }[]>`
    SELECT ps.id FROM push_subscriptions ps
    WHERE ps.tenant_id = ${tenantId} ${roleFilter}
  `
  if (subs.length === 0) {
    return { enqueued: 0 }
  }

  // Tarea #7: respetar el horario silencioso del complejo. En madrugada el push
  // se agenda para las 08:00 locales (startAfter) en vez de sonar al instante.
  const tzRows = await sql<{ timezone: string | null }[]>`
    SELECT timezone FROM tenants WHERE id = ${tenantId} LIMIT 1
  `
  const timeZone = tzRows[0]?.timezone ?? DEFAULT_TIMEZONE
  const options = pushSendOptions(new Date(), timeZone)

  const boss = await getBoss()
  await Promise.all(
    subs.map((sub) => {
      // F3 (hallazgo D4): un retry de pg-boss (retryLimit=3 en
      // PUSH_SEND_SEND_OPTIONS) puede reentregar el job push-send tras un fallo
      // post-envío; con dedupeKey el worker reclama la fila en push_send_log y no
      // duplica el push visible. Sin ella (tipos no listados) es at-least-once.
      const dedupeKey = dedupeKeyFor(tenantId, payload, sub.id)
      const data: PushSendJobData = {
        subscription_id: sub.id,
        payload,
        ...(dedupeKey ? { dedupeKey } : {}),
      }
      return boss.send(QUEUE_PUSH_SEND, data, options)
    }),
  )
  logger.info('enqueued admin push notifications', {
    module: 'push.service',
    tenantId,
    count: subs.length,
    payloadType: payload.type,
  })
  return { enqueued: subs.length }
}

/**
 * Notify all subscribed admins of a given staff_user_id (for /api/admin/push/test).
 */
export async function notifyStaffPush(
  tenantId: string,
  staffUserId: string,
  payload: AdminPushPayload,
): Promise<{ enqueued: number }> {
  const sql = getWorkerSql()
  const subs = await sql<{ id: string }[]>`
    SELECT id FROM push_subscriptions
    WHERE tenant_id = ${tenantId} AND staff_user_id = ${staffUserId}
  `
  if (subs.length === 0) return { enqueued: 0 }
  const boss = await getBoss()
  await Promise.all(
    subs.map((sub) => {
      const data: PushSendJobData = { subscription_id: sub.id, payload }
      return boss.send(QUEUE_PUSH_SEND, data, PUSH_SEND_SEND_OPTIONS)
    }),
  )
  logger.info('enqueued staff push notifications', {
    module: 'push.service',
    tenantId,
    staffUserId,
    count: subs.length,
    payloadType: payload.type,
  })
  return { enqueued: subs.length }
}

/**
 * Push al admin cuando una reserva con seña online queda confirmada — sea por
 * el webhook de MP o por cualquiera de los caminos de reconciliación (ENS-15:
 * el webhook ya disparaba este push, la reconciliación no). Extraído del
 * handler del webhook para que expiry precheck / reconcile worker lo reusen
 * sin triplicar la query de contexto + formateo de fecha/hora.
 *
 * Debe llamarse DESPUÉS de que la transacción que confirmó el booking haya
 * hecho commit — reabre su propia tx corta vía `withTenantContext` (no
 * comparte scope con la tx del caller). Nunca lanza: un fallo de push no debe
 * tirar abajo la confirmación del pago.
 */
export async function notifyAdminBookingConfirmed(
  tenantId: string,
  bookingId: string,
): Promise<void> {
  try {
    const ctx = await loadBookingPushContext(tenantId, bookingId)
    await notifyAdminPush(tenantId, {
      type: 'booking.confirmed_online',
      bookingId,
      courtName: ctx.courtName,
      dateLabel: ctx.dateLabel,
      timeLabel: ctx.timeLabel,
      // `/grilla`, no `/admin/grilla`: `(admin)` es un route GROUP de Next y no
      // aparece en la URL. Con el prefijo, tocar la notificación de una reserva
      // nueva llevaba a un 404 — el destino del push nunca existió.
      url: `/grilla?date=${ctx.ymd}&highlight=${bookingId}`,
    })
  } catch (err) {
    logger.error('push dispatch after booking confirmation failed', {
      module: 'push.service',
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Push al admin cuando el JUGADOR cancela su reserva (en la app o por el bot de
 * WhatsApp). `late` = la cancelación cayó dentro de la ventana de cancelación
 * tardía y sumó un strike. No se llama cuando cancela el staff (`cancelByAdmin`):
 * lo hizo el propio admin.
 *
 * Mismo contrato que `notifyAdminBookingConfirmed`: DESPUÉS del commit, tx corta
 * propia para leer el contexto, y nunca lanza.
 */
export async function notifyAdminBookingCanceled(
  tenantId: string,
  bookingId: string,
  opts: { late: boolean },
): Promise<void> {
  try {
    const ctx = await loadBookingPushContext(tenantId, bookingId)
    await notifyAdminPush(tenantId, bookingCanceledPayload({ bookingId, late: opts.late, ...ctx }))
  } catch (err) {
    logger.error('push dispatch after booking cancellation failed', {
      module: 'push.service',
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Push de plan SaaS (prueba por vencer, cobro rechazado, suspensión…) SOLO al
 * dueño: el encargado no ve facturación. Va junto al mail que ya existe, no en
 * su lugar. DESPUÉS del commit de la transición, y nunca lanza.
 */
export async function notifyOwnerPlanEvent(
  tenantId: string,
  event: PlanPushEvent,
  dedupeId: string,
): Promise<void> {
  try {
    await notifyAdminPush(tenantId, planPushPayload(event, dedupeId), { onlyRole: 'admin' })
  } catch (err) {
    logger.error('push dispatch for plan event failed', {
      module: 'push.service',
      tenantId,
      event: event.event,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Cancha, día y hora de una reserva, ya formateados para el copy de un push. */
async function loadBookingPushContext(tenantId: string, bookingId: string) {
  const bookingCtxRows = await withTenantContext(tenantId, (tx) =>
    tx.execute(drizzleSql`
      SELECT c.name AS court_name,
             b.date::text AS date,
             b.time_start AS time_start,
             b.time_end AS time_end
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      WHERE b.id = ${bookingId}
      LIMIT 1
    `),
  )
  const ctx = (
    bookingCtxRows as unknown as Array<{
      court_name: string
      date: string
      time_start: string
      time_end: string
    }>
  )[0]
  const ymd = ctx?.date?.slice(0, 10) ?? ''
  const dateLabel = ctx?.date
    ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        timeZone: DEFAULT_TIMEZONE,
      })
    : ymd
  // `time` llega como HH:MM:SS: el aviso muestra HH:MM (el '24:00' del día operativo se respeta).
  const timeStart = ctx?.time_start?.slice(0, 5) ?? ''
  const timeEnd = ctx?.time_end?.slice(0, 5) ?? ''
  const timeLabel = timeStart && timeEnd ? `${timeStart}–${timeEnd}` : timeStart
  return { courtName: ctx?.court_name, ymd, dateLabel, timeLabel }
}
