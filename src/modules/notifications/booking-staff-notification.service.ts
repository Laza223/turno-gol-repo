import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { enqueueStaffAgendaChange } from './staff-agenda.service'
import { enqueueStaffNotification, isStaffNotificationsEnabled } from './staff-notification.service'

/** Capture the intention inside the SAME transaction that changed the booking. */
export async function enqueueBookingStaffNotification(
  tenantId: string,
  bookingId: string,
  event: 'confirmed' | 'canceled',
  tx: DbTx,
  late = false,
): Promise<void> {
  if (!(await isStaffNotificationsEnabled(tenantId, tx))) return
  const rows = (await tx.execute(sql`
    SELECT b.date::text AS date, b.time_start::text AS time_start,
           b.time_end::text AS time_end, b.starts_at::text AS starts_at,
           c.name AS court_name, COALESCE(p.first_name, b.guest_name, '') AS player_name,
           COALESCE(p.phone, b.guest_phone) AS player_phone
    FROM bookings b
    JOIN courts c ON c.id = b.court_id AND c.tenant_id = b.tenant_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.id = ${bookingId} AND b.tenant_id = ${tenantId}
      AND b.created_by_staff IS NULL AND b.type = 'spontaneous'
    LIMIT 1
  `)) as unknown as Array<{
    date: string
    time_start: string
    time_end: string
    starts_at: string
    court_name: string
    player_name: string
    player_phone: string | null
  }>
  const booking = rows[0]
  if (!booking) return

  const expiresAt = new Date(booking.starts_at)
  if (expiresAt.getTime() <= Date.now()) return
  const date = booking.date.slice(0, 10)
  const eventKey = `booking.${event}:${bookingId}`
  const suffix = await enqueueStaffAgendaChange(tenantId, tx, { mergeIntoEventKey: eventKey })
  const title =
    event === 'confirmed'
      ? `Nueva reserva — ${booking.court_name}`
      : `${late ? 'Cancelación tardía' : 'Reserva cancelada'} — ${booking.court_name}`
  const timeStart = booking.time_start.slice(0, 5)
  const timeEnd = booking.time_end.slice(0, 5)
  const dateLabel = date.split('-').reverse().join('/')
  const body = [`${dateLabel} · ${timeStart}–${timeEnd}`, suffix].filter(Boolean).join('. ')
  const url = `/grilla?date=${date}${event === 'confirmed' ? `&highlight=${bookingId}` : ''}`

  await enqueueStaffNotification(
    {
      tenantId,
      eventKey,
      type: event === 'confirmed' ? 'booking.confirmed_online' : 'booking.canceled_by_player',
      audience: 'staff',
      policy: 'push_preferred',
      payload: {
        type: event === 'confirmed' ? 'booking.confirmed_online' : 'booking.canceled_by_player',
        bookingId,
        courtName: booking.court_name,
        dateLabel,
        timeLabel: `${timeStart}–${timeEnd}`,
        title,
        body,
        url,
      },
      email:
        event === 'confirmed'
          ? {
              templateName: 'admin_new_booking',
              content: {
                courtName: booking.court_name,
                date: dateLabel,
                timeStart,
                timeEnd,
                playerName: booking.player_name,
                ...(booking.player_phone ? { playerPhone: booking.player_phone } : {}),
              },
            }
          : { templateName: 'staff_alert', content: { title, body, url } },
      expiresAt,
    },
    tx,
  )
}
