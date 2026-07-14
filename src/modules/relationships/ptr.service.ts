import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { NO_SHOW_STRIKE_WINDOW_DAYS, NO_SHOW_SOFTBAN_DAYS } from '@/shared/constants'

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
