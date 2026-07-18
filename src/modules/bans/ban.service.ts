import { and, eq, sql } from 'drizzle-orm'
import { players, tenantPlayerBans } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import type { ManualBanDuration } from './ban.schema'

export type BanCheckResult =
  | { banned: false }
  | { banned: true; bannedGlobal: boolean; reason: string; until: Date | null }

/**
 * Fragmento de vigencia compartido por todo lector/escritor de
 * tenant_player_bans: NULL = ban indefinido (siempre vigente), o vigente
 * mientras banned_until no haya pasado. Único lugar donde vive este
 * predicado — banPlayerManually y liftPlayerBan lo reusan para encontrar el
 * ban activo antes de reemplazarlo/levantarlo.
 */
function banVigenteCond() {
  return sql`(${tenantPlayerBans.bannedUntil} IS NULL OR ${tenantPlayerBans.bannedUntil} > NOW())`
}

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
        banVigenteCond(),
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

/**
 * Motivo del ban vigente de un jugador en un tenant — usado por el checkout
 * público (`(public)/[slug]/reservar/page.tsx`) para mostrar el `reason` real
 * en el banner de error SIN que viaje por query string (R3-5): antes
 * `createBookingAndCheckout` lo mandaba en `?reason=...`, lo que permitía
 * fabricar URLs con texto arbitrario en un dominio legítimo (ingeniería
 * social) y lo filtraba a logs/analytics/referrers. Ahora la página lo relee
 * de acá server-side. Delega en `checkPlayerBanned` (misma fuente que
 * `PlayerBannedError.reason`, ya reusa `banVigenteCond` internamente y cubre
 * tanto el ban manual/softban de `tenantPlayerBans` como el ban global de
 * `players.status`) para no duplicar el predicado de vigencia.
 */
export async function getActiveBanReason(
  playerId: string,
  tenantId: string,
  tx: DbTx,
): Promise<string | null> {
  const result = await checkPlayerBanned(playerId, tenantId, tx)
  return result.banned ? result.reason : null
}

const DAY_MS = 24 * 60 * 60 * 1000
const MANUAL_BAN_DAYS: Record<Exclude<ManualBanDuration, 'indefinite'>, number> = {
  '7d': 7,
  '30d': 30,
}

/** Traduce la duración elegida en el modal a una fecha de fin (null = indefinido). Pura, sin DB. */
export function resolveManualBanUntil(duration: ManualBanDuration, now: Date): Date | null {
  if (duration === 'indefinite') return null
  return new Date(now.getTime() + MANUAL_BAN_DAYS[duration] * DAY_MS)
}

/**
 * Ban manual del complejo (doc7 Flujo 5B): el staff bloquea a un jugador
 * conflictivo de mostrador, con motivo propio y duración elegida (a
 * diferencia del softban automático de applyNoShowStrike/extendSoftban en
 * ptr.service.ts, que dispara solo). Si ya hay un ban vigente para este
 * jugador en este tenant, lo REEMPLAZA (nuevo reason/bannedUntil/bannedBy,
 * banned_at se refresca) en vez de duplicar — el trigger
 * enforce_single_active_ban (migración 005) rechaza un 2do INSERT mientras
 * el primero siga vigente. FOR UPDATE lockea la fila existente para
 * serializar clicks concurrentes del mismo mostrador.
 */
export async function banPlayerManually(
  tenantId: string,
  playerId: string,
  staffUserId: string,
  reason: string,
  bannedUntil: Date | null,
  tx: DbTx,
): Promise<void> {
  const existing = await tx
    .select({ id: tenantPlayerBans.id })
    .from(tenantPlayerBans)
    .where(
      and(
        eq(tenantPlayerBans.tenantId, tenantId),
        eq(tenantPlayerBans.playerId, playerId),
        banVigenteCond(),
      ),
    )
    .limit(1)
    .for('update')

  if (existing[0]) {
    await tx
      .update(tenantPlayerBans)
      .set({ reason, bannedUntil, bannedBy: staffUserId, bannedAt: new Date() })
      .where(eq(tenantPlayerBans.id, existing[0].id))
    return
  }

  await tx.insert(tenantPlayerBans).values({
    tenantId,
    playerId,
    reason,
    bannedUntil,
    bannedBy: staffUserId,
  })
}

/**
 * Levanta el ban vigente (manual o softban automático) de un jugador.
 * Modelo elegido: UPDATE banned_until = NOW() — NO se borra la fila. Esto
 * preserva el historial (quién banió, motivo, cuándo) para auditoría, y
 * reusa el MISMO predicado de vigencia que ya lee checkPlayerBanned
 * (banVigenteCond: `banned_until IS NULL OR banned_until > NOW()`): fijar
 * banned_until al instante actual saca la fila de "vigente" sin introducir
 * un estado nuevo (soft-delete flag, etc.) que checkPlayerBanned tendría
 * que aprender a leer aparte.
 * No-op (devuelve false) si no había ningún ban vigente para levantar.
 */
export async function liftPlayerBan(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<boolean> {
  const result = await tx
    .update(tenantPlayerBans)
    .set({ bannedUntil: sql`NOW()` })
    .where(
      and(
        eq(tenantPlayerBans.tenantId, tenantId),
        eq(tenantPlayerBans.playerId, playerId),
        banVigenteCond(),
      ),
    )
    .returning({ id: tenantPlayerBans.id })

  return result.length > 0
}
