/**
 * ENS-1: "Tenés N turnos por jugar" filtraba solo por fecha (>= hoy) y
 * contaba reservas canceladas/expiradas/jugadas como si fueran turnos
 * pendientes (mis-reservas/page.tsx). Solo cuentan las que TODAVÍA van a
 * jugarse: `confirmed` (turno firme) y `pending_payment` (esperando seña,
 * todavía puede confirmarse). Enums con una sola L (`canceled_*`, CLAUDE.md).
 *
 * B10 — desde que la lista se pagina por tab en SQL, el número ya no se puede
 * derivar de las filas en pantalla (parado en Historial no hay ninguna próxima
 * a la vista). Lo cuenta una query aparte, y por eso el vocabulario vive acá
 * EXPORTADO: la query lo interpola en vez de repetir la lista de enums. Un
 * estado nuevo se agrega en un solo lugar o los dos caminos divergen en
 * silencio, que es la clase que ya nos mordió con el total de plata en calle.
 */
export const UPCOMING_PLAYABLE_STATUSES = ['confirmed', 'pending_payment'] as const

const PLAYABLE_SET: ReadonlySet<string> = new Set(UPCOMING_PLAYABLE_STATUSES)

export function countUpcomingPlayable(
  bookings: Array<{ date: string; status: string }>,
  today: string,
): number {
  return bookings.filter((b) => b.date >= today && PLAYABLE_SET.has(b.status)).length
}
