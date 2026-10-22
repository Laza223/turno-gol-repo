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
 *   7. RIVAL (migr. 099): su WhatsApp guardado se borra de TODOS sus partidos; los
 *      partidos abiertos que organiza quedan cancelados; sus participaciones en
 *      partidos abiertos de otros pasan a `left` (la base promueve al banco);
 *      se borran sus suscripciones a alertas y se anulan position, zone,
 *      rival_accepted_at, rival_terms_version y signup_source. Las filas
 *      históricas (plantel, denuncias) siguen apuntando al jugador anonimizado.
 *   8. Audit logs created per-tenant for traceability.
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

    // RIVAL (migr. 099). Esta tx corre SIN `app.current_player_id` (pool worker),
    // así que los triggers BEFORE de reglas por actor se saltean y los UPDATE
    // de abajo pasan. Lo que NO depende del actor es el AFTER de `rival_participants`:
    // dispara con el cambio de estado, recuenta `confirmed_count` y promueve al
    // primero del banco cuando se libera un lugar. Por eso bajarlo a `left` con
    // un UPDATE (y no borrar la fila) es lo que mantiene el banco consistente.
    //
    // El WhatsApp se borra de TODOS sus partidos (también de los ya vencidos y
    // de los que no se cancelan abajo): es un dato personal, no un historial.
    await tx.execute(sql`
      DELETE FROM rival_match_contacts
      WHERE match_id IN (SELECT id FROM rival_matches WHERE organizer_player_id = ${playerId})
    `)
    // Los partidos abiertos que organiza se caen y salen del tablón (el CHECK
    // exige on_board = false al cancelar). Vencidos: son historia, no se tocan.
    // Mismo orden único de locks (099): por id, antes del UPDATE.
    await tx.execute(sql`
      SELECT id FROM rival_matches
      WHERE organizer_player_id = ${playerId} AND status = 'open' AND starts_at > NOW()
      ORDER BY id
      FOR UPDATE
    `)
    await tx.execute(sql`
      UPDATE rival_matches
      SET status = 'canceled', on_board = false, seeking = NULL, seeking_position = NULL
      WHERE organizer_player_id = ${playerId}
        AND status = 'open'
        AND starts_at > NOW()
    `)
    // Sus lugares en partidos abiertos de otros se liberan (confirmado, banco o
    // pedido pendiente). Las filas quedan, apuntando al jugador anonimizado.
    // Orden único de locks (099): primero los partidos, por id para no cruzarse
    // con otro barrido, y recién después las filas de participantes.
    await tx.execute(sql`
      SELECT id FROM rival_matches
      WHERE id IN (
        SELECT match_id FROM rival_participants
        WHERE player_id = ${playerId} AND status IN ('requested', 'confirmed', 'bench')
      )
      ORDER BY id
      FOR UPDATE
    `)
    await tx.execute(sql`
      UPDATE rival_participants
      SET status = 'left'
      WHERE player_id = ${playerId}
        AND status IN ('requested', 'confirmed', 'bench')
        AND match_id IN (
          SELECT id FROM rival_matches
          WHERE status = 'open' AND starts_at > NOW() AND organizer_player_id <> ${playerId}
        )
    `)
    await tx.execute(sql`DELETE FROM rival_alert_subscriptions WHERE player_id = ${playerId}`)

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
          last_login_at = NULL,
          rival_accepted_at = NULL,
          rival_terms_version = NULL,
          position = NULL,
          zone = NULL,
          signup_source = NULL
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
