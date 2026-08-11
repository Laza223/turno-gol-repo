import { sql } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { track } from '@/shared/observability'

export class PlayerNotFoundError extends Error {
  constructor(playerId: string) {
    super(`Player ${playerId} not found`)
    this.name = 'PlayerNotFoundError'
  }
}

export class PlayerAlreadyAnonymizedError extends Error {
  constructor(playerId: string) {
    super(`Player ${playerId} is already anonymized`)
    this.name = 'PlayerAlreadyAnonymizedError'
  }
}

/**
 * Anonymize a single player's PII (Ley 25.326 derecho de supresión).
 *
 * What happens:
 *   1. PII fields replaced: email → 'anon-<id>@anon.local', names → '[eliminado]',
 *      phone/avatar/preferredArea → NULL.
 *   2. Status → 'anonymized'; ban fields cleared.
 *   3. player_tenant_relationships → deleted (all tenants).
 *   4. tenant_player_bans → deleted (all tenants).
 *   5. bookings.player_id → NULL (preserves booking history for financial
 *      metrics without linking back to the anonymized player).
 *   6. payments.player_id → NULL (same reasoning).
 *   7. Audit logs created per-tenant for traceability.
 *
 * Does NOT delete: bookings, payments, cash_flows — financial records stay
 * intact for the complexes' accounting/metrics.
 */
export async function anonymizePlayer(playerId: string): Promise<void> {
  // Cross-tenant by design: this DELETEs/UPDATEs tenant_player_bans, bookings
  // and payments across EVERY tenant the player ever touched, with no single
  // app.current_tenant_id to SET LOCAL. Under the restricted `turnogol_app`
  // pool (PR #30, FORCE RLS) those statements would each match 0 rows and the
  // ARCO deletion (Ley 25.326) would silently no-op on the RLS-isolated
  // tables while `players` still flips to anonymized — same bug class as
  // getStaffRole, needs the bypass-capable worker pool.
  const db = getWorkerDb()

  await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, status, email FROM players WHERE id = ${playerId} FOR UPDATE
    `)
    const player = (
      rows as unknown as Array<{
        id: string
        status: string
        email: string
      }>
    )[0]

    if (!player) throw new PlayerNotFoundError(playerId)
    if (player.status === 'anonymized') throw new PlayerAlreadyAnonymizedError(playerId)

    const affectedTenants = await tx.execute(sql`
      SELECT DISTINCT tenant_id AS "tenantId" FROM player_tenant_relationships
      WHERE player_id = ${playerId}
    `)
    const tenantIds = (affectedTenants as unknown as Array<{ tenantId: string }>).map(
      (r) => r.tenantId,
    )

    await tx.execute(sql`
      DELETE FROM tenant_player_bans WHERE player_id = ${playerId}
    `)

    await tx.execute(sql`
      DELETE FROM player_tenant_relationships WHERE player_id = ${playerId}
    `)

    await tx.execute(sql`
      UPDATE bookings SET player_id = NULL, updated_at = NOW()
      WHERE player_id = ${playerId}
    `)

    await tx.execute(sql`
      UPDATE payments SET player_id = NULL
      WHERE player_id = ${playerId}
    `)

    await tx.execute(sql`
      UPDATE players
      SET status = 'anonymized'::player_status,
          email = ${'anon-' + playerId + '@anon.local'},
          first_name = '[eliminado]',
          last_name = '[eliminado]',
          phone = NULL,
          avatar_url = NULL,
          preferred_area = NULL,
          ban_reason = NULL,
          ban_until = NULL,
          agreed_to_terms_at = NULL,
          terms_version = NULL,
          last_login_at = NULL
      WHERE id = ${playerId}
    `)

    for (const tenantId of tenantIds) {
      await insertSystemAuditLog(tx, {
        tenantId,
        action: 'player.anonymized',
        resourceType: 'player',
        resourceId: playerId,
        metadata: { reason: 'Ley 25.326 derecho de supresión' },
      })
    }
  })

  track.auth('player.anonymized', { playerId })
}
