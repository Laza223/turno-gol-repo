import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

// Corre dentro de withPlayerContext (RLS app.current_player_id sobre bookings).

export type PlayerActivity = {
  /** Partidos con status=completed. */
  played: number
  /** Complejos distintos donde completó al menos un partido. */
  venues: number
  /** Lunes ISO (YYYY-MM-DD) de cada semana con al menos un partido completado. */
  weeksWithGames: string[]
}

/**
 * Actividad del jugador derivada de sus bookings (sin tabla nueva): solo
 * cuentan los partidos efectivamente jugados (completed) — confirmados a
 * futuro, cancelados y no-shows quedan afuera. Las semanas vienen como
 * date_trunc('week') (lunes ISO), pocas filas aunque haya cientos de partidos.
 */
export async function getPlayerActivity(playerId: string, tx: DbTx): Promise<PlayerActivity> {
  const totals = (await tx.execute(sql`
    SELECT COUNT(*)::int AS played,
           COUNT(DISTINCT tenant_id)::int AS venues
    FROM bookings
    WHERE player_id = ${playerId} AND status = 'completed'
  `)) as unknown as Array<{ played: number; venues: number }>

  const weeks = (await tx.execute(sql`
    SELECT DISTINCT (date_trunc('week', date::timestamp)::date)::text AS week
    FROM bookings
    WHERE player_id = ${playerId} AND status = 'completed'
    ORDER BY week DESC
  `)) as unknown as Array<{ week: string }>

  return {
    played: totals[0]?.played ?? 0,
    venues: totals[0]?.venues ?? 0,
    weeksWithGames: weeks.map((w) => w.week),
  }
}

/** Lunes ISO (YYYY-MM-DD) de la semana que contiene la fecha dada. */
export function isoMondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const sinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - sinceMonday)
  return d.toISOString().slice(0, 10)
}

function prevWeek(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Racha actual: semanas consecutivas (hacia atrás) con al menos un partido
 * jugado. Si la semana en curso todavía no tiene partidos no corta la racha —
 * arranca a contar desde la anterior (el jugador puede tener el partido de
 * esta semana aún por jugarse).
 */
export function computeStreakWeeks(weeksWithGames: string[], todayWeekStart: string): number {
  const weeks = new Set(weeksWithGames)
  let cursor = weeks.has(todayWeekStart) ? todayWeekStart : prevWeek(todayWeekStart)
  let streak = 0
  while (weeks.has(cursor)) {
    streak++
    cursor = prevWeek(cursor)
  }
  return streak
}
