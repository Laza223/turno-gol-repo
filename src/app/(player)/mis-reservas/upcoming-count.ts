/**
 * ENS-1: "Tenés N turnos por jugar" filtraba solo por fecha (>= hoy) y
 * contaba reservas canceladas/expiradas/jugadas como si fueran turnos
 * pendientes (mis-reservas/page.tsx). Solo cuentan las que TODAVÍA van a
 * jugarse: `confirmed` (turno firme) y `pending_payment` (esperando seña,
 * todavía puede confirmarse). Enums con una sola L (`canceled_*`, CLAUDE.md).
 */
const UPCOMING_PLAYABLE_STATUSES = new Set(['confirmed', 'pending_payment'])

export function countUpcomingPlayable(
  bookings: Array<{ date: string; status: string }>,
  today: string,
): number {
  return bookings.filter((b) => b.date >= today && UPCOMING_PLAYABLE_STATUSES.has(b.status))
    .length
}
