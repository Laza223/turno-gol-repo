import type { StandingRow } from '@/modules/tournaments/standings/types'
import type {
  TournamentFormat,
  TournamentEventType,
  TournamentMatchStatus,
  TournamentStatus,
  TournamentTeamStatus,
} from '@/modules/tournaments/tournament.types'

// Helpers puros de presentación: sin DB, sin React. Se testean solos
// (mismo criterio que caja-lib.ts).

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

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Borrador',
  registration: 'Inscripción abierta',
  in_progress: 'En curso',
  finished: 'Terminado',
  canceled: 'Cancelado',
}

export const TEAM_STATUS_LABELS: Record<TournamentTeamStatus, string> = {
  registered: 'Inscripto',
  confirmed: 'Confirmado',
  withdrawn: 'Se bajó',
  disqualified: 'Descalificado',
}

/**
 * Clases del badge de estado. Color + TEXTO siempre: el color solo no comunica
 * (MASTER §1.4, ~8% de daltonismo).
 */
export function statusBadgeClass(status: TournamentStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-muted text-muted-foreground'
    case 'registration':
      return 'bg-info/15 text-blue-800 dark:text-blue-300'
    case 'in_progress':
      return 'bg-success/15 text-emerald-800 dark:text-emerald-300'
    case 'finished':
      return 'bg-muted text-foreground'
    case 'canceled':
      return 'bg-destructive/10 text-red-700 dark:text-red-300'
  }
}

export function teamStatusBadgeClass(status: TournamentTeamStatus): string {
  switch (status) {
    case 'registered':
      return 'bg-muted text-muted-foreground'
    case 'confirmed':
      return 'bg-success/15 text-emerald-800 dark:text-emerald-300'
    case 'withdrawn':
      return 'bg-warning/15 text-amber-800 dark:text-amber-300'
    case 'disqualified':
      return 'bg-destructive/10 text-red-700 dark:text-red-300'
  }
}

/** Centavos ARS → '$85.000'. Sin decimales: los montos del rubro son enteros. */
export function formatArs(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('es-AR')}`
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

export const MATCH_STATUS_LABELS: Record<TournamentMatchStatus, string> = {
  scheduled: 'Programado',
  played: 'Jugado',
  walkover: 'No se presentó',
  postponed: 'Postergado',
  canceled: 'Cancelado',
}

export function matchStatusBadgeClass(status: TournamentMatchStatus): string {
  switch (status) {
    case 'scheduled':
      return 'bg-muted text-muted-foreground'
    case 'played':
      return 'bg-success/15 text-emerald-800 dark:text-emerald-300'
    case 'walkover':
      return 'bg-warning/15 text-amber-800 dark:text-amber-300'
    case 'postponed':
      return 'bg-info/15 text-blue-800 dark:text-blue-300'
    case 'canceled':
      return 'bg-destructive/10 text-red-700 dark:text-red-300'
  }
}

/** 'Fecha 3' en liga, 'Semifinal' en llaves. */
export function roundLabel(
  round: number,
  kind: 'league' | 'group_stage' | 'knockout',
  totalRounds: number
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

/** Día y hora del partido en ART. Sin librería: UTC-3 fijo, como el resto. */
export function formatMatchWhen(startsAt: Date | null): string {
  if (!startsAt) return 'Sin agendar'
  const art = new Date(startsAt.getTime() - 3 * 3600_000)
  const d = String(art.getUTCDate()).padStart(2, '0')
  const m = String(art.getUTCMonth() + 1).padStart(2, '0')
  const hh = String(art.getUTCHours()).padStart(2, '0')
  const mm = String(art.getUTCMinutes()).padStart(2, '0')
  return `${d}/${m} · ${hh}:${mm}`
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

// ─── Resultados y disciplina (migr. 065) ────────────────────────────

export const EVENT_TYPE_LABELS: Record<TournamentEventType, string> = {
  goal: 'Gol',
  own_goal: 'Gol en contra',
  yellow_card: 'Amarilla',
  red_card: 'Roja',
}

/** Siempre ícono + texto, nunca color solo (MASTER §6.5). */
export function eventTypeBadgeClass(type: TournamentEventType): string {
  switch (type) {
    case 'goal':
      return 'bg-success/15 text-emerald-800 dark:text-emerald-300'
    case 'own_goal':
      return 'bg-muted text-muted-foreground'
    case 'yellow_card':
      return 'bg-warning/15 text-amber-800 dark:text-amber-300'
    case 'red_card':
      return 'bg-destructive/10 text-red-700 dark:text-red-300'
  }
}

export const qualificationBadgeClass = 'bg-success/15 text-emerald-800 dark:text-emerald-300'
export const suspensionBadgeClass = 'bg-warning/15 text-amber-800 dark:text-amber-300'

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
