import { sql } from 'drizzle-orm'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { FREE_ONLINE_CANCEL_PAUSE_THRESHOLD } from '@/shared/constants'
import { artMonthOf } from '@/modules/tenants/tenant.lifecycle'

/**
 * Pausa automática del plan gratis (freemium, decisión 3): si el dueño cancela
 * `FREE_ONLINE_CANCEL_PAUSE_THRESHOLD` reservas online en el mes, la reserva
 * online se pausa hasta que avise que ya marcó sus ocupados. Es la señal de que
 * la grilla no refleja lo que pasa en la cancha y los jugadores reservan horarios
 * que ya estaban tomados.
 *
 * [C5] Corre en su propia transacción, DESPUÉS de que commiteó la cancelación y
 * sin el lock del tope: el UPDATE es atómico (cuenta y marca en una sentencia), así
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

/** "Ya marqué mis ocupados": reabre la reserva online y reinicia la cuenta. */
export async function resumeFreeOnlineBooking(tenantId: string, tx: DbTx): Promise<void> {
  await tx.execute(sql`
    UPDATE tenants
    SET online_paused_at = NULL, online_pause_reset_at = NOW()
    WHERE id = ${tenantId} AND online_paused_at IS NOT NULL
  `)
}
