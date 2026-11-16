import { sql } from 'drizzle-orm'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { FREE_ONLINE_CANCEL_PAUSE_THRESHOLD } from '@/shared/constants'
import { artMonthOf } from '@/modules/tenants/tenant.lifecycle'
import { FreeOnlinePausedError } from './booking.errors'

/**
 * Plan gratis: las reservas online no tienen tope (ajuste del 2026-11-16 en
 * docs/decisions/2026-11-15-freemium-corte-v2.md). Lo único que las corta es la
 * pausa de abajo.
 */

const MONTH_CREATED = sql`to_char(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM')`

/**
 * Reservas online del mes ART (Métricas del gratis): las creadas en el mes,
 * menos las vencidas sin pagar y las que canceló el jugador.
 */
export async function countOnlineThisMonth(
  tenantId: string,
  month: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND type = 'spontaneous'
      AND created_by_staff IS NULL
      AND status <> 'expired'
      AND canceled_by IS DISTINCT FROM 'player'
      AND ${MONTH_CREATED} = ${month}
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

/**
 * Alta online: tira `FreeOnlinePausedError` si el complejo es gratis y tiene la
 * reserva online en pausa. La ficha ya muestra WhatsApp/Llamar en ese caso
 * (`effectiveAllowOnlineBooking`); esto es la autoridad, por si la ficha se
 * quedó vieja.
 */
export async function assertFreeOnlineNotPaused(tenantId: string, tx: DbTx): Promise<void> {
  const rows = (await tx.execute(sql`
    SELECT status::text AS status, online_paused_at FROM tenants WHERE id = ${tenantId} LIMIT 1
  `)) as unknown as Array<{ status: string; online_paused_at: string | null }>
  const tenant = rows[0]
  if (tenant?.status === 'free' && tenant.online_paused_at != null) {
    throw new FreeOnlinePausedError(tenantId)
  }
}

/**
 * Pausa automática del plan gratis (freemium, decisión 3): si el dueño cancela
 * `FREE_ONLINE_CANCEL_PAUSE_THRESHOLD` reservas online en el mes, la reserva
 * online se pausa hasta que avise que ya marcó sus ocupados. Es la señal de que
 * la grilla no refleja lo que pasa en la cancha y los jugadores reservan horarios
 * que ya estaban tomados.
 *
 * [C5] Corre en su propia transacción, DESPUÉS de que commiteó la cancelación: el UPDATE es atómico (cuenta y marca en una sentencia), así
 * que dos cancelaciones simultáneas no pausan dos veces ni se pisan.
 */
export async function evaluateFreeOnlinePause(tenantId: string): Promise<boolean> {
  const month = artMonthOf()
  return withTenantContext(tenantId, async (tx) => {
    const rows = (await tx.execute(sql`
      UPDATE tenants t
      SET online_paused_at = NOW()
      WHERE t.id = ${tenantId}
        AND t.status = 'free'
        AND t.online_paused_at IS NULL
        AND (
          SELECT COUNT(*)
          FROM bookings b
          WHERE b.tenant_id = t.id
            AND b.type = 'spontaneous'
            AND b.created_by_staff IS NULL
            AND b.canceled_by = 'admin'
            AND to_char(b.canceled_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') = ${month}
            AND (t.online_pause_reset_at IS NULL OR b.canceled_at > t.online_pause_reset_at)
        ) >= ${FREE_ONLINE_CANCEL_PAUSE_THRESHOLD}
      RETURNING t.id
    `)) as unknown as Array<{ id: string }>
    return rows.length > 0
  })
}

/** "Ya anoté mis turnos": reabre la reserva online y reinicia la cuenta. */
export async function resumeFreeOnlineBooking(tenantId: string, tx: DbTx): Promise<void> {
  await tx.execute(sql`
    UPDATE tenants
    SET online_paused_at = NULL, online_pause_reset_at = NOW()
    WHERE id = ${tenantId} AND online_paused_at IS NOT NULL
  `)
}
