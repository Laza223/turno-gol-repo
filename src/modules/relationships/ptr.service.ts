import { and, eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { playerTenantRelationships } from '@/shared/db/schema'
import { NO_SHOW_STRIKE_WINDOW_DAYS, NO_SHOW_SOFTBAN_DAYS } from '@/shared/constants'
import { normalizePlayerTags, type PlayerTag } from './player-tags'

export async function ensurePTR(playerId: string, tenantId: string, tx: DbTx): Promise<void> {
  await tx.execute(sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count, last_booking_at)
    VALUES (${tenantId}, ${playerId}, 1, NOW())
    ON CONFLICT (player_id, tenant_id)
    DO UPDATE SET
      bookings_count = player_tenant_relationships.bookings_count + 1,
      last_booking_at = NOW()
  `)
}

const NO_SHOW_SOFTBAN_REASON = `Ausencias reiteradas (2+ en ${NO_SHOW_STRIKE_WINDOW_DAYS} días)`

export type NoShowStrikeResult = {
  /** Ausencias contadas dentro de la ventana de reincidencia vigente. */
  noshowCount: number
  /** true si esta ausencia disparó (o extendió) un softban. */
  softbanned: boolean
  /** Fecha hasta la que queda bloqueado, solo si softbanned. */
  bannedUntil: Date | null
}

/**
 * Extiende (o crea) el softban de ausencias reiteradas en tenant_player_bans.
 * Si ya hay un ban activo permanente (banned_until IS NULL, ban manual del
 * complejo) no lo toca. Si hay un ban activo con fecha, lo extiende al máximo
 * entre la fecha actual y la nueva (cubre el caso de una 3ra+ ausencia
 * mientras el softban anterior todavía está vigente — el trigger
 * enforce_single_active_ban de la migración 005 no permite un 2do INSERT).
 */
async function extendSoftban(
  tenantId: string,
  playerId: string,
  now: Date,
  tx: DbTx,
): Promise<Date | null> {
  const newUntil = new Date(now.getTime() + NO_SHOW_SOFTBAN_DAYS * 24 * 60 * 60 * 1000)

  const existing = (await tx.execute(sql`
    SELECT id, banned_until FROM tenant_player_bans
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
      AND (banned_until IS NULL OR banned_until > ${now.toISOString()})
    LIMIT 1
    FOR UPDATE
  `)) as unknown as Array<{ id: string; banned_until: string | null }>

  const ban = existing[0]
  if (ban && ban.banned_until === null) return null // ban permanente: no se toca

  if (ban) {
    const rows = (await tx.execute(sql`
      UPDATE tenant_player_bans
      SET banned_until = GREATEST(banned_until, ${newUntil.toISOString()})
      WHERE id = ${ban.id}
      RETURNING banned_until
    `)) as unknown as Array<{ banned_until: string }>
    return new Date(rows[0]!.banned_until)
  }

  const inserted = (await tx.execute(sql`
    INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_until, banned_by)
    VALUES (${tenantId}, ${playerId}, ${NO_SHOW_SOFTBAN_REASON}, ${newUntil.toISOString()}, NULL)
    RETURNING banned_until
  `)) as unknown as Array<{ banned_until: string }>
  return new Date(inserted[0]!.banned_until)
}

/**
 * Decide el contador de ausencias tras una nueva. Si la última ausencia fue
 * hace más de NO_SHOW_STRIKE_WINDOW_DAYS (o nunca faltó), resetea a 1 — el
 * jugador vuelve a foja cero. Si no, es reincidencia dentro de la ventana:
 * suma 1. Función pura para testearla sin DB.
 */
export function nextNoShowCount(
  lastNoShowAt: Date | null,
  currentCount: number,
  now: Date,
): number {
  if (!lastNoShowAt) return 1
  const windowMs = NO_SHOW_STRIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const withinWindow = now.getTime() - lastNoShowAt.getTime() <= windowMs
  return withinWindow ? currentCount + 1 : 1
}

/**
 * Softban por ausencias reiteradas (reemplaza la deuda por no-show del cambio
 * #5). 1ra ausencia (o 1ra después de NO_SHOW_STRIKE_WINDOW_DAYS sin faltar)
 * solo se registra. 2da ausencia dentro de la ventana dispara un bloqueo de
 * NO_SHOW_SOFTBAN_DAYS vía tenant_player_bans.
 *
 * FOR UPDATE lockea la fila del jugador antes de decidir: serializa
 * ausencias concurrentes del mismo jugador.
 * El INSERT ON CONFLICT DO NOTHING previo crea la relación si la reserva era
 * manual y el jugador todavía no tenía PTR (createManualBooking no llama a
 * ensurePTR). Debe correr dentro del mismo tx que la transición a no_show.
 */
export async function applyNoShowStrike(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<NoShowStrikeResult> {
  await tx.execute(sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id)
    VALUES (${tenantId}, ${playerId})
    ON CONFLICT (player_id, tenant_id) DO NOTHING
  `)

  const rows = (await tx.execute(sql`
    SELECT noshow_count, last_no_show_at FROM player_tenant_relationships
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
    LIMIT 1
    FOR UPDATE
  `)) as unknown as Array<{ noshow_count: number; last_no_show_at: string | null }>
  const current = rows[0]!
  const lastNoShowAt = current.last_no_show_at ? new Date(current.last_no_show_at) : null

  const now = new Date()
  const noshowCount = nextNoShowCount(lastNoShowAt, Number(current.noshow_count), now)

  await tx.execute(sql`
    UPDATE player_tenant_relationships
    SET noshow_count = ${noshowCount}, last_no_show_at = ${now.toISOString()}
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `)

  if (noshowCount < 2) return { noshowCount, softbanned: false, bannedUntil: null }

  const bannedUntil = await extendSoftban(tenantId, playerId, now, tx)
  return { noshowCount, softbanned: bannedUntil !== null, bannedUntil }
}

export type NoShowStrikeRevertResult = {
  /** Ausencias contadas DESPUÉS de revertir esta. */
  noshowCount: number
  /** true si esta reversión levantó el softban automático que seguía vigente. */
  softbanLifted: boolean
}

/**
 * Inverso exacto de `applyNoShowStrike` (RI #1, doc6 §3): el admin marcó "No
 * vino" por error y lo corrige dentro de las 24h. Debe correr dentro del MISMO
 * tx que la transición no_show → completed (`revertNoShow`).
 *
 *  1. Decrementa `noshow_count` (piso 0 — nunca negativo aunque el contador
 *     esté desincronizado por datos viejos).
 *  2. Recalcula `last_no_show_at` desde la fuente de verdad: el `updated_at`
 *     más reciente de los bookings que SIGUEN en `no_show` de ese jugador en
 *     ese complejo, excluyendo el que se está corrigiendo (se excluye por id
 *     para no depender del orden en que corran las sentencias dentro del tx).
 *     Sin ausencias restantes queda NULL — el jugador vuelve a foja cero y la
 *     ventana de reincidencia arranca limpia.
 *  3. Levanta el softban SÓLO si el contador ya no alcanza el umbral de
 *     reincidencia (< 2) y SÓLO si el ban vigente es el auto-creado por
 *     `extendSoftban` (`banned_by IS NULL` + `reason` exacto). Un ban manual
 *     del complejo — o un ban manual que `extendSoftban` sólo extendió, que
 *     conserva su propio reason/banned_by — NUNCA se toca acá: levantarlo es
 *     decisión del complejo vía `liftPlayerBan`.
 *
 * Modelo de "levantar": `banned_until = NOW()`, idéntico a `liftPlayerBan`
 * (ban.service.ts) — preserva el historial de la fila y reusa el predicado de
 * vigencia que ya lee `checkPlayerBanned`, sin introducir un flag nuevo.
 *
 * NO toca la seña: si se capturó al marcar la ausencia (`deposit_status =
 * 'captured'`), sigue capturada. La devolución, si corresponde, se resuelve
 * entre jugador y complejo (decisión de auditoría 2026-07-21).
 */
export async function revertNoShowStrike(
  tenantId: string,
  playerId: string,
  bookingId: string,
  tx: DbTx,
): Promise<NoShowStrikeRevertResult> {
  const rows = (await tx.execute(sql`
    SELECT noshow_count FROM player_tenant_relationships
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
    LIMIT 1
    FOR UPDATE
  `)) as unknown as Array<{ noshow_count: number }>

  // Sin fila PTR no hay strike que revertir (reserva manual de un jugador que
  // nunca se vinculó, o PTR ya borrada).
  const current = rows[0]
  if (!current) return { noshowCount: 0, softbanLifted: false }

  const noshowCount = Math.max(Number(current.noshow_count) - 1, 0)

  await tx.execute(sql`
    UPDATE player_tenant_relationships
    SET noshow_count = ${noshowCount},
        last_no_show_at = (
          SELECT MAX(b.updated_at) FROM bookings b
          WHERE b.tenant_id = ${tenantId}
            AND b.player_id = ${playerId}
            AND b.status = 'no_show'
            AND b.id <> ${bookingId}
        )
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `)

  if (noshowCount >= 2) return { noshowCount, softbanLifted: false }

  // `banned_until > NOW()` ya excluye los bans permanentes (NULL), que además
  // nunca los crea extendSoftban.
  const lifted = (await tx.execute(sql`
    UPDATE tenant_player_bans
    SET banned_until = NOW()
    WHERE tenant_id = ${tenantId}
      AND player_id = ${playerId}
      AND banned_by IS NULL
      AND reason = ${NO_SHOW_SOFTBAN_REASON}
      AND banned_until > NOW()
    RETURNING id
  `)) as unknown as Array<{ id: string }>

  return { noshowCount, softbanLifted: lifted.length > 0 }
}

export type SetPlayerTagsResult = {
  before: PlayerTag[]
  after: PlayerTag[]
}

/**
 * Reemplaza el set completo de etiquetas del jugador EN ESTE COMPLEJO (B12/D3).
 *
 * Devuelve `null` si no existe la relación: el jugador no está vinculado a este
 * complejo, y crearla acá sería inventar un vínculo que ninguna reserva creó.
 *
 * Va por el query builder y NO por `tx.execute(sql\`…\`)` a propósito: en SQL
 * crudo, un array de un solo elemento se serializa como escalar y Postgres
 * responde `malformed array literal: "no_credit"`. El builder conoce el tipo de
 * la columna (`player_tag[]`) y lo manda bien.
 *
 * `SELECT ... FOR UPDATE` antes del UPDATE, en la misma transacción: el `before`
 * del audit log sale de la fila lockeada, así que ninguna otra sesión la puede
 * cambiar entre la lectura y la escritura. La tx ya está bajo
 * `withTenantContext`, y el filtro explícito por `tenant_id` es la segunda
 * barrera además de la policy (en dev la app conecta como superusuario y RLS no
 * aplica).
 */
export async function setPlayerTags(
  tenantId: string,
  playerId: string,
  tags: readonly PlayerTag[],
  tx: DbTx,
): Promise<SetPlayerTagsResult | null> {
  const scope = and(
    eq(playerTenantRelationships.tenantId, tenantId),
    eq(playerTenantRelationships.playerId, playerId),
  )

  const [prev] = await tx
    .select({ tags: playerTenantRelationships.tags })
    .from(playerTenantRelationships)
    .where(scope)
    .limit(1)
    .for('update')

  if (!prev) return null

  const next = normalizePlayerTags(tags)
  const [updated] = await tx
    .update(playerTenantRelationships)
    .set({ tags: next })
    .where(scope)
    .returning({ tags: playerTenantRelationships.tags })

  if (!updated) return null
  return { before: prev.tags ?? [], after: updated.tags ?? [] }
}
