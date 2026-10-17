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

/**
 * Con `nowMs` y `ends_at` manda el instante físico: cuenta lo que todavía no terminó, también el
 * turno de 00:00 de `closes_next_day` cuyo día operativo ya es ayer, y no cuenta un turno de hoy que
 * ya terminó. Sin `ends_at` (o sin `nowMs`) se filtra solo por día, como siempre.
 */
export function countUpcomingPlayable(
  bookings: Array<{ date: string; status: string; ends_at?: string | Date }>,
  today: string,
  nowMs?: number,
): number {
  return bookings.filter(
    (b) =>
      PLAYABLE_SET.has(b.status) &&
      (nowMs === undefined || b.ends_at === undefined
        ? b.date >= today
        : new Date(b.ends_at).getTime() > nowMs),
  ).length
}
