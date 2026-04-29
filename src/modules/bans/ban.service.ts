import { and, eq, sql } from 'drizzle-orm'
import { players, tenantPlayerBans } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'

export type BanCheckResult =
  | { banned: false }
  | { banned: true; bannedGlobal: boolean; reason: string; until: Date | null }

export async function checkPlayerBanned(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<BanCheckResult> {
  const playerRows = await tx
    .select({ status: players.status })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1)

  if (playerRows[0]?.status === 'banned') {
    return { banned: true, bannedGlobal: true, reason: 'Jugador suspendido globalmente.', until: null }
  }

  const banRows = await tx
    .select({ reason: tenantPlayerBans.reason, bannedUntil: tenantPlayerBans.bannedUntil })
    .from(tenantPlayerBans)
    .where(
      and(
        eq(tenantPlayerBans.tenantId, tenantId),
        eq(tenantPlayerBans.playerId, playerId),
        sql`(${tenantPlayerBans.bannedUntil} IS NULL OR ${tenantPlayerBans.bannedUntil} > NOW())`,
      ),
    )
    .limit(1)

  if (banRows[0]) {
    return {
      banned: true,
      bannedGlobal: false,
      reason: banRows[0].reason,
      until: banRows[0].bannedUntil,
    }
  }

  return { banned: false }
}
