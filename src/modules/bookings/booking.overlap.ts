import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

/**
 * ¿Hay una reserva viva pisando este rango físico en esta cancha?
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
 * Chequear acá no reemplaza al constraint (dos transacciones concurrentes
 * pueden pasar las dos): sirve para dar un error lindo y, en el caso de series
 * (abonados, torneos), para saltear la fecha en conflicto sin abortar el resto.
 * El constraint es la garantía real.
 *
 * OJO: `checkBookingOverlap` en abonado.service.ts usa un predicado más ancho
 * (`status NOT IN ('canceled_refunded','canceled_no_refund')`, o sea también
 * frena contra `expired`/`completed`/`no_show`). Son semánticas distintas y
 * unificarlas cambiaría el comportamiento de abonados, así que quedan separadas
 * a propósito.
 */
export async function hasActiveBookingOverlap(
  courtId: string,
  startsAt: Date,
  endsAt: Date,
  tx: DbTx,
): Promise<boolean> {
  const result = await tx.execute(sql`
    SELECT 1
    FROM bookings
    WHERE court_id = ${courtId}
      AND status IN ('pending_payment', 'confirmed')
      AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
    LIMIT 1
  `)
  return (result as unknown as unknown[]).length > 0
}
