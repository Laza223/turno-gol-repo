import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { insertAuditLog } from '@/shared/db/audit'
import { withDisposableWorkerDb } from '@/shared/db/client'
import { players, rivalMatches, rivalParticipants, rivalReports } from '@/shared/db/schema'
import { deletePlayerPhotoObject } from '@/modules/players/player-photo.service'

/**
 * Moderación de RIVAL desde el super-admin (spec §8): ocultar / restaurar un partido y
 * quitar la foto de un perfil. Cada acción deja su fila en `audit_logs` EN LA MISMA
 * transacción que el cambio. Con el pool worker no hay `app.current_player_id`, así que
 * los triggers de reglas del actor (099) se saltean y el UPDATE es posible.
 *
 * El ban global sigue por SQL (spec §8): no hay acción acá.
 */

const WRITE_TIMEOUT_MS = 10_000

export class RivalMatchNotFoundError extends Error {
  constructor() {
    super('rival_match_not_found')
    this.name = 'RivalMatchNotFoundError'
  }
}

class RivalPlayerNotFoundError extends Error {
  constructor() {
    super('rival_player_not_found')
    this.name = 'RivalPlayerNotFoundError'
  }
}

async function setHidden(matchId: string, adminId: string, hide: boolean): Promise<void> {
  await withDisposableWorkerDb(WRITE_TIMEOUT_MS, (db) =>
    db.transaction(async (tx) => {
      const changed = await tx
        .update(rivalMatches)
        .set({ hiddenAt: hide ? new Date() : null })
        .where(
          and(
            eq(rivalMatches.id, matchId),
            hide ? isNull(rivalMatches.hiddenAt) : isNotNull(rivalMatches.hiddenAt),
          ),
        )
        .returning({ tenantId: rivalMatches.tenantId })
      const row = changed[0]
      if (!row) {
        // Ya estaba en ese estado (idempotente, sin auditoría doble) o no existe.
        const exists = await tx
          .select({ id: rivalMatches.id })
          .from(rivalMatches)
          .where(eq(rivalMatches.id, matchId))
          .limit(1)
        if (exists.length === 0) throw new RivalMatchNotFoundError()
        return
      }
      await insertAuditLog(tx, {
        tenantId: row.tenantId,
        actorId: adminId,
        actorType: 'system',
        action: hide ? 'rival.match_hidden' : 'rival.match_restored',
        resourceType: 'rival_match',
        resourceId: matchId,
      })
    }),
  )
}

export function hideMatch(matchId: string, adminId: string): Promise<void> {
  return setHidden(matchId, adminId, true)
}

export function restoreMatch(matchId: string, adminId: string): Promise<void> {
  return setHidden(matchId, adminId, false)
}

/**
 * Quita la foto del perfil (`players.avatar_url = NULL`). `matchId` es el partido donde se
 * vio la foto: de ahí sale el complejo de la fila de auditoría (el jugador es cross-tenant),
 * y la persona tiene que estar vinculada a ese partido (denunciada en él o en su plantel);
 * si no, error genérico y sin auditoría. La fila del jugador se lockea (`FOR UPDATE`): dos
 * clics concurrentes dejan una sola auditoría.
 *
 * El borrado del objeto en R2 va DESPUÉS del commit y es best-effort: si falla, el cambio ya
 * está aplicado y no se devuelve error.
 */
export async function removePlayerAvatar(
  playerId: string,
  matchId: string,
  adminId: string,
): Promise<void> {
  const previousUrl = await withDisposableWorkerDb(WRITE_TIMEOUT_MS, (db) =>
    db.transaction(async (tx) => {
      const match = await tx
        .select({ tenantId: rivalMatches.tenantId })
        .from(rivalMatches)
        .where(eq(rivalMatches.id, matchId))
        .limit(1)
      if (!match[0]) throw new RivalMatchNotFoundError()
      const [reported, member] = await Promise.all([
        tx
          .select({ id: rivalReports.id })
          .from(rivalReports)
          .where(
            and(eq(rivalReports.matchId, matchId), eq(rivalReports.reportedPlayerId, playerId)),
          )
          .limit(1),
        tx
          .select({ id: rivalParticipants.id })
          .from(rivalParticipants)
          .where(
            and(eq(rivalParticipants.matchId, matchId), eq(rivalParticipants.playerId, playerId)),
          )
          .limit(1),
      ])
      if (reported.length === 0 && member.length === 0) throw new RivalPlayerNotFoundError()
      const player = await tx
        .select({ avatarUrl: players.avatarUrl })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1)
        .for('update')
      if (!player[0]) throw new RivalPlayerNotFoundError()
      // Sin foto (o ya la quitó otro clic): nada que quitar ni que auditar.
      if (player[0].avatarUrl === null) return null
      await tx.update(players).set({ avatarUrl: null }).where(eq(players.id, playerId))
      await insertAuditLog(tx, {
        tenantId: match[0].tenantId,
        actorId: adminId,
        actorType: 'system',
        action: 'rival.avatar_removed',
        resourceType: 'player',
        resourceId: playerId,
        metadata: { matchId },
      })
      return player[0].avatarUrl
    }),
  )
  // Después del commit, como en la baja del propio jugador: no lanza y, si R2 falla, el
  // barrido diario de huérfanos lo termina.
  await deletePlayerPhotoObject(previousUrl)
}
