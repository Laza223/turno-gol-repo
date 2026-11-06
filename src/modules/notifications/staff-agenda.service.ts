import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { nightCutoffMins, operatingDateOf, operatingDayRangeUtc } from '@/shared/time/operating-day'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { quietHoursReleaseAt } from './push-quiet-hours'
import { decideAgendaNotification, type AgendaSnapshot } from './staff-agenda'
import { enqueueStaffNotification, isStaffNotificationsEnabled } from './staff-notification.service'

/**
 * Actualiza la primera reserva informada bajo el mismo lock para el sweep y el
 * evento de negocio. Las queries de reservas son lecturas, nunca FOR UPDATE:
 * el dominio ya puede tener una reserva tomada antes de llegar a este helper.
 * Con mergeIntoEventKey el caller incorpora el texto al aviso de ese evento.
 */
export async function enqueueStaffAgendaChange(
  tenantId: string,
  tx: DbTx,
  opts?: { mergeIntoEventKey?: string },
): Promise<string | null> {
  if (!(await isStaffNotificationsEnabled(tenantId, tx))) return null
  const tenantRows = (await tx.execute(sql`
    SELECT opening_hours, closes_next_day, timezone
    FROM tenants WHERE id = ${tenantId}
      AND status IN ('trialing', 'active', 'past_due')
  `)) as unknown as Array<{
    opening_hours: OpeningHours
    closes_next_day: boolean
    timezone: string
  }>
  const tenant = tenantRows[0]
  if (!tenant) return null
  const now = new Date()
  if (quietHoursReleaseAt(now, tenant.timezone)) return null
  const cutoff = nightCutoffMins(tenant.opening_hours, tenant.closes_next_day)
  const date = operatingDateOf(now, cutoff)
  await tx.execute(sql`
    INSERT INTO staff_agenda_state (tenant_id, operating_date)
    VALUES (${tenantId}, ${date}::date) ON CONFLICT (tenant_id) DO NOTHING
  `)
  const rows = (await tx.execute(sql`
    SELECT operating_date::text, first_booking_id, first_starts_at, revision, started
    FROM staff_agenda_state WHERE tenant_id = ${tenantId} FOR UPDATE
  `)) as unknown as Array<{
    operating_date: string
    first_booking_id: string | null
    first_starts_at: string | null
    revision: number
    started: boolean
  }>
  const row = rows[0]
  if (!row) return null
  const previous: AgendaSnapshot = {
    operatingDate: row.operating_date,
    firstBookingId: row.first_booking_id,
    firstStartsAt: row.first_starts_at ? new Date(row.first_starts_at).toISOString() : null,
    revision: row.revision,
    started: row.started,
  }
  if (previous.operatingDate === date && previous.started) return null
  const bookings = (await tx.execute(sql`
    SELECT b.id, b.starts_at, c.name AS court_name
    FROM bookings b JOIN courts c ON c.id = b.court_id AND c.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${tenantId} AND b.date = ${date}::date
      AND b.type <> 'block' AND b.status IN ('confirmed', 'completed', 'no_show')
    ORDER BY b.starts_at, b.id
  `)) as unknown as Array<{ id: string; starts_at: string; court_name: string }>
  const { snapshot, notification } = decideAgendaNotification({
    date,
    now,
    previous,
    bookings: bookings.map((b) => ({
      id: b.id,
      startsAt: new Date(b.starts_at),
      courtName: b.court_name,
    })),
    dayEndsAt: operatingDayRangeUtc(date, cutoff).toUtc,
  })
  await tx.execute(sql`
    UPDATE staff_agenda_state
    SET operating_date = ${date}::date, first_booking_id = ${snapshot.firstBookingId},
        first_starts_at = ${snapshot.firstStartsAt}::timestamptz,
        revision = ${snapshot.revision}, started = ${snapshot.started}, updated_at = now()
    WHERE tenant_id = ${tenantId}
  `)
  if (!notification) return null

  // Una agenda nueva vuelve obsoleto cualquier snapshot aún no despachado.
  await tx.execute(sql`
    UPDATE notifications SET status = 'failed', last_error = 'agenda_superseded', expires_at = now()
    WHERE tenant_id = ${tenantId} AND channel = 'push' AND status IN ('queued', 'sending')
      AND event_key LIKE ${`agenda:${date}:%`}
  `)
  if (opts?.mergeIntoEventKey && notification.type === 'agenda.first_changed') {
    return notification.title
  }
  await enqueueStaffNotification(
    {
      tenantId,
      eventKey: `agenda:${date}:${snapshot.revision}`,
      type: notification.type,
      payload: {
        ...notification,
        expiresAt: notification.expiresAt.toISOString(),
        date,
        url: '/dashboard',
      },
      audience: 'staff',
      policy: 'push_only',
      expiresAt: notification.expiresAt,
    },
    tx,
  )
  return null
}
