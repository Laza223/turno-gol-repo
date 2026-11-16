import type { PgBoss } from 'pg-boss'
import { getWorkerSql } from '@/shared/db/client'
import { logger } from '@/shared/lib/logger'
import { quietHoursReleaseAt } from '@/modules/notifications/push-quiet-hours'
import { getBoss } from '../boss'
import {
  CRON_WORK_OPTIONS,
  PUSH_SEND_SEND_OPTIONS,
  QUEUE_PLAYER_REMINDERS,
  QUEUE_PUSH_SEND,
  type PushSendJobData,
} from '../definitions'

/**
 * Recordatorio de turno al jugador por push, 24 h y 2 h antes (decisión
 * 2026-11-16, levanta el veto de recordatorios de v1). Cron por minuto: cada tick
 * busca los turnos confirmados de las próximas 24 h, decide qué aviso toca y lo
 * reclama en `player_reminder_sends` antes de encolar, así un tick repetido o un
 * reinicio no lo duplica. En el horario silencioso del complejo no se manda nada:
 * el próximo tick después de las 08:00 lo vuelve a evaluar.
 */

const HOUR_MS = 3_600_000
export type ReminderKind = '24h' | '2h'

/**
 * Qué aviso corresponde ahora. Un turno sacado con menos anticipación que el
 * aviso no lo recibe (el que reserva para dentro de una hora no necesita que le
 * recuerden). El de 24 h tiene una ventana que se cierra 4 h antes del turno: si
 * se perdió (worker caído, avisos activados tarde), no llega pegado al de 2 h.
 */
export function reminderKindFor(startsAt: Date, createdAt: Date, now: Date): ReminderKind | null {
  const untilStart = startsAt.getTime() - now.getTime()
  if (untilStart <= 0) return null
  const lead = startsAt.getTime() - createdAt.getTime()
  if (untilStart <= 2 * HOUR_MS) return lead >= 2 * HOUR_MS ? '2h' : null
  if (untilStart <= 4 * HOUR_MS) return null
  if (untilStart <= 24 * HOUR_MS) return lead >= 24 * HOUR_MS ? '24h' : null
  return null
}

function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date)
}

/** "Hoy jugás a las 20:00" o "Mañana jugás a las 20:00", según el calendario del complejo. */
export function reminderTitle(startsAt: Date, now: Date, timeZone: string): string {
  const time = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(startsAt)
  const today = localDateKey(startsAt, timeZone) === localDateKey(now, timeZone)
  return `${today ? 'Hoy' : 'Mañana'} jugás a las ${time}`
}

type Candidate = {
  id: string
  player_id: string
  starts_at: Date
  created_at: Date
  court_name: string
  tenant_name: string
  timezone: string
}

/**
 * Reclama el aviso y lo encola. Si encolar falla, libera el claim para que el
 * próximo tick lo reintente: perder el recordatorio en silencio es peor.
 */
async function queueReminder(
  sql: ReturnType<typeof getWorkerSql>,
  boss: Awaited<ReturnType<typeof getBoss>>,
  booking: Candidate,
  kind: ReminderKind,
  now: Date,
): Promise<boolean> {
  const claim = await sql`
    INSERT INTO player_reminder_sends (booking_id, kind, starts_at)
    VALUES (${booking.id}, ${kind}, ${booking.starts_at})
    ON CONFLICT DO NOTHING
    RETURNING booking_id
  `
  if (claim.length === 0) return false
  try {
    const subs = await sql<{ id: string }[]>`
      SELECT id FROM player_push_subscriptions WHERE player_id = ${booking.player_id}
    `
    for (const sub of subs) {
      const job: PushSendJobData = {
        subscription_id: sub.id,
        audience: 'player',
        payload: {
          type: 'player.reminder',
          bookingId: booking.id,
          title: reminderTitle(booking.starts_at, now, booking.timezone),
          body: `${booking.tenant_name} · ${booking.court_name}`,
          url: '/mis-reservas',
          eventId: `player.reminder:${booking.id}:${kind}`,
          // Después de empezado el turno el aviso no sirve: el TTL del proveedor
          // y el SW lo respetan (no queda fijo en pantalla tarde).
          expiresAt: booking.starts_at.toISOString(),
        },
      }
      await boss.send(QUEUE_PUSH_SEND, job, PUSH_SEND_SEND_OPTIONS)
    }
    return subs.length > 0
  } catch (error) {
    await sql`
      DELETE FROM player_reminder_sends
      WHERE booking_id = ${booking.id} AND kind = ${kind} AND starts_at = ${booking.starts_at}
    `.catch(() => {})
    throw error
  }
}

async function runPlayerRemindersSweep(now = new Date()): Promise<number> {
  // Cruza todos los complejos y jugadores: pool worker (BYPASSRLS).
  const sql = getWorkerSql()
  // Un claim tiene, como mucho, 24 h hasta su turno: a los 3 días ya no sirve.
  await sql`DELETE FROM player_reminder_sends WHERE created_at < now() - interval '3 days'`
  const candidates = await sql<Candidate[]>`
    SELECT b.id, b.player_id, b.starts_at, b.created_at,
      c.name AS court_name, t.name AS tenant_name, t.timezone
    FROM bookings b
    JOIN players p ON p.id = b.player_id AND p.status = 'active'
    JOIN courts c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    WHERE b.status = 'confirmed'
      AND b.type <> 'block'
      AND b.starts_at > ${now}
      AND b.starts_at <= ${new Date(now.getTime() + 24 * HOUR_MS)}
      AND EXISTS (SELECT 1 FROM player_push_subscriptions s WHERE s.player_id = b.player_id)
  `
  let sent = 0
  const boss = candidates.length > 0 ? await getBoss() : null
  for (const booking of candidates) {
    const kind = reminderKindFor(booking.starts_at, booking.created_at, now)
    if (!boss || !kind || quietHoursReleaseAt(now, booking.timezone)) continue
    // Un turno que falla no frena al resto: se loguea y el próximo tick lo reintenta.
    try {
      if (await queueReminder(sql, boss, booking, kind, now)) sent++
    } catch (error) {
      logger.warn('player-reminders: could not queue reminder', {
        module: 'player-reminders',
        bookingId: booking.id,
        kind,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (sent > 0) logger.info('player reminders queued', { module: 'player-reminders', count: sent })
  return sent
}

export async function registerPlayerRemindersWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_PLAYER_REMINDERS, '* * * * *', {})
  await boss.work(QUEUE_PLAYER_REMINDERS, CRON_WORK_OPTIONS, async () => {
    await runPlayerRemindersSweep()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_PLAYER_REMINDERS })
}
