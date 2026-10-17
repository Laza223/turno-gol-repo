import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { bookings } from '@/shared/db/schema'

export type OwnLiveBooking = { id: string; status: 'confirmed' | 'pending_payment' }

/**
 * ¿Este turno ya es MÍO? Lo que distingue "otra persona lo reservó" de "lo reservé yo hace un
 * segundo": el doble envío o la recarga de la pantalla de confirmar chocan con la reserva que acaba
 * de crear el primer envío, y decirle "ese turno ya no está disponible" a quien acaba de reservarlo
 * es mentirle. Solo lectura. Corre bajo `withPlayerContext`: el filtro por `player_id` es explícito
 * y RLS (`player_own_bookings_select`) es la segunda barrera.
 *
 * `timeStart` puede llegar como `HH:MM` o `HH:MM:SS` (la columna es `time`): se compara casteando,
 * no como texto. Solo cuentan las vivas — una cancelada, vencida o ya jugada no es "mi turno".
 */
export async function findOwnLiveBooking(
  tx: DbTx,
  input: { playerId: string; courtId: string; date: string; timeStart: string },
): Promise<OwnLiveBooking | null> {
  const [row] = await tx
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(
      and(
        eq(bookings.playerId, input.playerId),
        eq(bookings.courtId, input.courtId),
        sql`${bookings.date} = ${input.date}::date`,
        sql`${bookings.timeStart} = ${input.timeStart}::time`,
        inArray(bookings.status, ['confirmed', 'pending_payment']),
      ),
    )
    .limit(1)
  if (!row || (row.status !== 'confirmed' && row.status !== 'pending_payment')) return null
  return { id: row.id, status: row.status }
}
