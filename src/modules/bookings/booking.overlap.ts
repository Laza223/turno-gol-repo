import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

/** Un rango físico candidato: la cancha y los instantes de inicio y fin. */
export type OverlapCandidate = {
  courtId: string
  startsAt: Date
  endsAt: Date
}

/**
 * Núcleo compartido de los dos chequeos de solapamiento. Recibe el predicado de
 * estado porque abonados y torneos usan uno DISTINTO a propósito (ver los dos
 * envoltorios de abajo); lo único que comparten es la mecánica: armar la lista
 * de candidatos como `VALUES` y preguntar de una sola vez cuáles pisan algo.
 *
 * Devuelve los ÍNDICES (posición en `candidates`) que están en conflicto, para
 * que el llamador decida qué hacer con cada uno sin re-emparejar por cancha y
 * horario.
 *
 * Chequear acá NO reemplaza al exclusion constraint (dos transacciones
 * concurrentes pueden pasar las dos): sirve para dar un error lindo y, en el
 * caso de series (abonados, torneos), para saltear la fecha en conflicto sin
 * abortar el resto. El constraint es la garantía real.
 */
async function findOverlapIndexes(
  candidates: readonly OverlapCandidate[],
  statusPredicate: ReturnType<typeof sql>,
  tx: DbTx,
): Promise<Set<number>> {
  if (candidates.length === 0) return new Set()

  const values = sql.join(
    candidates.map(
      (c, i) =>
        sql`(${i}::int, ${c.courtId}::uuid, ${c.startsAt.toISOString()}::timestamptz, ${c.endsAt.toISOString()}::timestamptz)`,
    ),
    sql`, `,
  )

  const rows = (await tx.execute(sql`
    SELECT c.idx
    FROM (VALUES ${values}) AS c(idx, court_id, starts_at, ends_at)
    WHERE EXISTS (
      SELECT 1
      FROM bookings b
      WHERE b.court_id = c.court_id
        AND ${statusPredicate}
        AND tstzrange(b.starts_at, b.ends_at) && tstzrange(c.starts_at, c.ends_at)
    )
  `)) as unknown as Array<{ idx: number }>

  return new Set(rows.map((r) => r.idx))
}

/**
 * ¿Cuáles de estos rangos físicos pisan una reserva viva?
 *
 * El predicado espeja EXACTAMENTE el exclusion constraint
 * `no_overlapping_bookings` (migr. 041):
 *
 *   EXCLUDE USING gist (court_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
 *   WHERE (status IN ('pending_payment', 'confirmed'))
 *
 * Es decir: una reserva `expired` o cancelada NO ocupa el turno, y por eso no
 * cuenta como conflicto — si contara, este chequeo optimista rechazaría horas
 * que la DB sí dejaría insertar.
 *
 * Es una sola consulta para todo el lote. La reserva de horas de un torneo
 * evaluaba `fechas × canchas × horarios` candidatos con una consulta cada uno
 * —144 SELECT secuenciales para 8 fechas × 3 canchas × 6 horas— y encima
 * manteniendo los `FOR UPDATE` de las canchas tomados durante todo el barrido.
 */
export async function findActiveBookingOverlaps(
  candidates: readonly OverlapCandidate[],
  tx: DbTx,
): Promise<Set<number>> {
  return findOverlapIndexes(candidates, sql`b.status IN ('pending_payment', 'confirmed')`, tx)
}

/**
 * El predicado ANCHO que usa abonados: cualquier reserva que no esté cancelada
 * ocupa el turno (también `expired`, `completed` y `no_show`).
 *
 * La diferencia con `findActiveBookingOverlaps` es deliberada: unificarlas
 * cambiaría el comportamiento de abonados, que a propósito no vuelve a ofrecer
 * una hora donde ya hubo un turno vencido o jugado.
 */
export async function findAbonadoBookingOverlaps(
  candidates: readonly OverlapCandidate[],
  tx: DbTx,
): Promise<Set<number>> {
  return findOverlapIndexes(
    candidates,
    sql`b.status NOT IN ('canceled_refunded', 'canceled_no_refund')`,
    tx,
  )
}
