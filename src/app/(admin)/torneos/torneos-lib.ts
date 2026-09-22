import type { StandingRow } from '@/modules/tournaments/standings/types'
import type { TournamentFormat } from '@/modules/tournaments/tournament.types'

// H027: existía un `formatArs` local (`$85.000`, sin espacio) que divergía del
// único formateador de plata del repo (`@/lib/format`, con NBSP: `$ 85.000`) —
// el mismo monto de inscripción se veía distinto en dos pestañas del mismo
// torneo. Los montos se formatean con `@/lib/format`; no hay copia acá.

// Helpers puros de presentación: sin DB, sin React. Se testean solos
// (mismo criterio que caja-lib.ts).
//
// Los estados (labels, tono e ícono de torneo, equipo, partido y evento) NO
// viven acá: son `@/lib/tournaments/status-visual`, porque el portal público
// muestra los mismos estados y no debería importar de la ruta del admin.

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  league: 'Liga (todos contra todos)',
  knockout: 'Eliminación directa',
  groups_playoff: 'Grupos + playoffs',
}

export const FORMAT_SHORT: Record<TournamentFormat, string> = {
  league: 'Liga',
  knockout: 'Eliminación',
  groups_playoff: 'Grupos + playoffs',
}

/** 'YYYY-MM-DD' → '12/07/2026'. Sin `new Date()`: evita el corrimiento de zona. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/** Rango de fechas del torneo, listo para el subtítulo. */
export function formatDateRange(startsOn: string, endsOn: string | null): string {
  if (!endsOn) return `Desde el ${formatDate(startsOn)}`
  if (endsOn === startsOn) return formatDate(startsOn)
  return `${formatDate(startsOn)} — ${formatDate(endsOn)}`
}

/** 'Fecha 3' en liga, 'Semifinal' en llaves. */
export function roundLabel(
  round: number,
  kind: 'league' | 'group_stage' | 'knockout',
  totalRounds: number,
): string {
  if (kind !== 'knockout') return `Fecha ${round}`
  const fromFinal = totalRounds - round
  switch (fromFinal) {
    case 0:
      return 'Final'
    case 1:
      return 'Semifinal'
    case 2:
      return 'Cuartos de final'
    case 3:
      return 'Octavos de final'
    default:
      return `Ronda ${round}`
  }
}

/** Hora de un instante en ART, sin fecha: '20:00'. UTC-3 fijo, como el resto. */
export function formatArtTime(instant: Date): string {
  const art = new Date(instant.getTime() - 3 * 3600_000)
  const hh = String(art.getUTCHours()).padStart(2, '0')
  const mm = String(art.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Día y hora del partido en ART. Sin librería: UTC-3 fijo, como el resto. */
export function formatMatchWhen(startsAt: Date | null): string {
  if (!startsAt) return 'Sin agendar'
  const art = new Date(startsAt.getTime() - 3 * 3600_000)
  const d = String(art.getUTCDate()).padStart(2, '0')
  const m = String(art.getUTCMonth() + 1).padStart(2, '0')
  return `${d}/${m} · ${formatArtTime(startsAt)}`
}

/** Marcador '3 - 1', o '—' si todavía no se jugó. */
export function formatScore(home: number | null, away: number | null): string {
  if (home === null || away === null) return '—'
  return `${home} - ${away}`
}

/**
 * Resumen de las horas tomadas: "12 horas · 3 canchas · 4 fechas".
 * Se calcula sobre las reservas que el torneo posee, no sobre lo pedido.
 */
export function summarizeSlots(slots: ReadonlyArray<{ courtId: string; date: string }>): string {
  if (slots.length === 0) return 'Sin horarios tomados'
  const courts = new Set(slots.map((s) => s.courtId)).size
  const dates = new Set(slots.map((s) => s.date)).size
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return [
    plural(slots.length, 'hora', 'horas'),
    plural(courts, 'cancha', 'canchas'),
    plural(dates, 'fecha', 'fechas'),
  ].join(' · ')
}

/** '+5' / '-3' / '0' — la diferencia de gol se lee mejor con signo. */
export function formatGoalDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff)
}

/** Por qué esta fila quedó arriba de la de abajo, en castellano. */
export function decidedByLabel(decidedBy: StandingRow['decidedBy']): string | null {
  switch (decidedBy) {
    case 'points':
      return 'Los separan los puntos'
    case 'goal_diff':
      return 'Los separa la diferencia de gol'
    case 'goals_for':
      return 'Los separan los goles a favor'
    case 'goals_against':
      return 'Los separan los goles en contra'
    case 'head_to_head':
      return 'Los separa el resultado entre ellos'
    case 'wins':
      return 'Los separan los partidos ganados'
    case 'fair_play':
      return 'Los separa el fair play'
    case 'drawn_lots':
      return 'Los separa el sorteo'
    case 'none':
      return null
  }
}

export const SUSPENSION_REASON_LABELS: Record<'yellow_accumulation' | 'red_card', string> = {
  yellow_accumulation: 'Acumulación de amarillas',
  red_card: 'Expulsión',
}
