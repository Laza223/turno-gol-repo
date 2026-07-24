import type {
  TournamentFormat,
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

/**
 * Resumen de las horas tomadas: "12 horas · 3 canchas · 4 fechas".
 * Se calcula sobre las reservas que el torneo posee, no sobre lo pedido.
 */
export function summarizeSlots(
  slots: ReadonlyArray<{ courtId: string; date: string }>,
): string {
  if (slots.length === 0) return 'Sin horarios tomados'
  const courts = new Set(slots.map((s) => s.courtId)).size
  const dates = new Set(slots.map((s) => s.date)).size
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`
  return [
    plural(slots.length, 'hora', 'horas'),
    plural(courts, 'cancha', 'canchas'),
    plural(dates, 'fecha', 'fechas'),
  ].join(' · ')
}
