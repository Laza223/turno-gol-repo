import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

export type PlayerBlockState = {
  /** Saldo deudor en centavos de ARS. > 0 = el jugador debe plata al complejo. */
  balance: number
  /** Estado de la relación: 'active' | 'blocked' (bloqueo explícito del complejo). */
  status: string
}

/**
 * Lee el estado de bloqueo del jugador en un complejo desde
 * player_tenant_relationships. Devuelve el default no-bloqueante si todavía no
 * existe la relación (primer contacto del jugador con el complejo).
 */
export async function getPlayerBlockState(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<PlayerBlockState> {
  const rows = (await tx.execute(sql`
    SELECT balance, status
    FROM player_tenant_relationships
    WHERE player_id = ${playerId} AND tenant_id = ${tenantId}
    LIMIT 1
  `)) as unknown as Array<{ balance: number | string; status: string }>
  const row = rows[0]
  if (!row) return { balance: 0, status: 'active' }
  return { balance: Number(row.balance ?? 0), status: row.status }
}

/**
 * Regla de negocio (CLAUDE.md): un jugador con saldo deudor (> 0) o con la
 * relación marcada como 'blocked' no puede reservar online en ese complejo.
 * Función pura para poder testearla sin DB.
 */
export function isBlockedForOnlineBooking(state: PlayerBlockState): boolean {
  return state.balance > 0 || state.status === 'blocked'
}

export async function ensurePTR(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count, last_booking_at)
    VALUES (${tenantId}, ${playerId}, 1, NOW())
    ON CONFLICT (player_id, tenant_id)
    DO UPDATE SET
      bookings_count = player_tenant_relationships.bookings_count + 1,
      last_booking_at = NOW()
  `)
}
