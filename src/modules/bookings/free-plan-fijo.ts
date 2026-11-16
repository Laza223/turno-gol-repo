import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { addDays } from '@/shared/dates/art'

/**
 * "¿Es un fijo?" (freemium v2, docs/planning/2026-11-15-freemium-v2.md): el
 * dueño del gratis anota el mismo nombre a la misma hora por tercera semana
 * seguida. Con el plan, ese turno se carga solo como fijo.
 *
 * Cuenta el turno que se acaba de anotar más el mismo día de la semana de las
 * dos anteriores, en cualquier cancha. Avisa solo en la tercera: si también
 * está la de tres semanas atrás, ya avisó antes y no se repite cada semana.
 * El nombre se compara sin mayúsculas ni espacios de más. No cuentan los
 * cancelados ni los vencidos.
 */
export async function isThirdWeekInARow(
  tenantId: string,
  input: { date: string; timeStart: string; guestName: string },
  tx: DbTx,
): Promise<boolean> {
  const name = input.guestName.trim()
  if (!name) return false
  const weekAgo = addDays(input.date, -7)
  const twoWeeksAgo = addDays(input.date, -14)
  const threeWeeksAgo = addDays(input.date, -21)
  const rows = (await tx.execute(sql`
    SELECT
      COUNT(DISTINCT date) FILTER (WHERE date <> ${threeWeeksAgo}::date)::int AS weeks,
      COUNT(*) FILTER (WHERE date = ${threeWeeksAgo}::date)::int AS older
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND type = 'spontaneous'
      AND status NOT IN ('canceled_refunded', 'canceled_no_refund', 'expired')
      AND date IN (${weekAgo}::date, ${twoWeeksAgo}::date, ${threeWeeksAgo}::date)
      AND time_start = ${input.timeStart}::time
      AND lower(btrim(guest_name)) = lower(${name})
  `)) as unknown as Array<{ weeks: number; older: number }>
  return (rows[0]?.weeks ?? 0) === 2 && (rows[0]?.older ?? 0) === 0
}
