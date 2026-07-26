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
 *   el push de booking confirmado (`booking.confirmed_online`, el único
 *   caller de producción hoy) incluye una dedupeKey determinística
 *   (`push:booking-confirmed:<bookingId>:<subscriptionId>`) que el worker
 *   reclama vía INSERT ... ON CONFLICT DO NOTHING en push_send_log ANTES de
 *   enviar (push.worker.ts) — así un retry no duplica el push visible al
 *   admin. Otros payloads (ej. el push de test de /api/admin/push/test, vía
 *   notifyStaffPush) NO llevan dedupeKey y siguen siendo at-least-once sin
 *   guard.
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
import { logger } from '@/shared/lib/logger'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

export type AdminPushPayload = PushSendJobData['payload']

export async function notifyAdminPush(
  tenantId: string,
  payload: AdminPushPayload,
): Promise<{ enqueued: number }> {
  const sql = getWorkerSql()
  const subs = await sql<{ id: string }[]>`
    SELECT id FROM push_subscriptions WHERE tenant_id = ${tenantId}
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
      // F3 (hallazgo D4): dedupeKey determinística SOLO para booking
      // confirmado (el único caller de producción de notifyAdminPush hoy —
      // ver notifyAdminBookingConfirmed más abajo). Otros tipos de payload
      // quedan sin dedupeKey: comportamiento viejo, at-least-once sin guard.
      const dedupeKey =
        payload.type === 'booking.confirmed_online' && payload.bookingId
          ? `push:booking-confirmed:${payload.bookingId}:${sub.id}`
          : undefined
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
    const ctx = (bookingCtxRows as unknown as Array<{
      court_name: string
      date: string
      time_start: string
      time_end: string
    }>)[0]
    const ymd = ctx?.date?.slice(0, 10) ?? ''
    const dateLabel = ctx?.date
      ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          timeZone: DEFAULT_TIMEZONE,
        })
      : ymd
    const timeStart = ctx?.time_start ?? ''
    const timeEnd = ctx?.time_end ?? ''
    const timeLabel = timeStart && timeEnd ? `${timeStart}–${timeEnd}` : timeStart

    await notifyAdminPush(tenantId, {
      type: 'booking.confirmed_online',
      bookingId,
      courtName: ctx?.court_name,
      dateLabel,
      timeLabel,
      // `/grilla`, no `/admin/grilla`: `(admin)` es un route GROUP de Next y no
      // aparece en la URL. Con el prefijo, tocar la notificación de una reserva
      // nueva llevaba a un 404 — el destino del push nunca existió.
      url: `/grilla?date=${ymd}&highlight=${bookingId}`,
    })
  } catch (err) {
    logger.error('push dispatch after booking confirmation failed', {
      module: 'push.service',
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
