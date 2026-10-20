import { and, eq, gt, sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { bookings } from '@/shared/db/schema'

/**
 * Reservas confirmadas que el jugador todavía tiene por jugar. Manda el instante físico
 * (`ends_at > now()`), el mismo criterio que Mis reservas: una confirmada de hoy que ya terminó no
 * cuenta, y el turno de 00:00 de un complejo que cierra pasada la medianoche, cuyo día operativo ya
 * es ayer, sí. Con `date >= hoy` pasaba lo contrario y el aviso mentía.
 */
export async function countUpcomingConfirmed(tx: DbTx, playerId: string): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.playerId, playerId),
        eq(bookings.status, 'confirmed'),
        gt(bookings.endsAt, sql`now()`),
      ),
    )
  return rows[0]?.count ?? 0
}
