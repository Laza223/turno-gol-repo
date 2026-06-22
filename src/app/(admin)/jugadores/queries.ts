import { sql, type SQL } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

export type PlayerListRow = {
  playerId: string
  name: string
  email: string
  phone: string | null
  /** Saldo deudor en centavos (> 0 = deuda → badge rojo). */
  balance: number
  bookingsCount: number
  noshowCount: number
  status: string
  lastBookingAt: string | null
}

function searchCond(q: string | undefined): SQL {
  if (!q) return sql``
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`)
  const like = `%${escaped}%`
  return sql`AND (
    (p.first_name || ' ' || p.last_name) ILIKE ${like}
    OR p.email ILIKE ${like}
    OR p.phone ILIKE ${like}
  )`
}

/**
 * Jugadores vinculados a ESTE complejo (player_tenant_relationships). Por
 * decisión de producto (#10 cancelada) el módulo muestra solo perfiles reales,
 * nunca invitados telefónicos (guest_name de bookings).
 */
export async function listTenantPlayers(
  tenantId: string,
  filters: { q?: string },
  tx: DbTx,
): Promise<PlayerListRow[]> {
  const rows = await tx.execute(sql`
    SELECT p.id AS "playerId",
           (p.first_name || ' ' || p.last_name) AS name,
           p.email, p.phone,
           r.balance, r.bookings_count AS "bookingsCount",
           r.noshow_count AS "noshowCount", r.status,
           r.last_booking_at::text AS "lastBookingAt"
    FROM player_tenant_relationships r
    JOIN players p ON p.id = r.player_id
    WHERE r.tenant_id = ${tenantId}
      ${searchCond(filters.q)}
    ORDER BY (r.balance > 0) DESC, r.last_booking_at DESC NULLS LAST, name ASC
    LIMIT 200
  `)
  return (rows as unknown as Array<PlayerListRow & { balance: number | string }>).map((r) => ({
    ...r,
    balance: Number(r.balance ?? 0),
  }))
}

export type PlayerProfile = {
  playerId: string
  name: string
  email: string
  phone: string | null
  balance: number
  status: string
  firstSeenAt: string | null
  lastBookingAt: string | null
}

export async function getPlayerProfile(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<PlayerProfile | null> {
  const rows = await tx.execute(sql`
    SELECT p.id AS "playerId",
           (p.first_name || ' ' || p.last_name) AS name,
           p.email, p.phone,
           r.balance, r.status,
           r.first_seen_at::text AS "firstSeenAt",
           r.last_booking_at::text AS "lastBookingAt"
    FROM player_tenant_relationships r
    JOIN players p ON p.id = r.player_id
    WHERE r.tenant_id = ${tenantId} AND r.player_id = ${playerId}
    LIMIT 1
  `)
  const row = (rows as unknown as Array<PlayerProfile & { balance: number | string }>)[0]
  if (!row) return null
  return { ...row, balance: Number(row.balance ?? 0) }
}

export type PlayerStats = {
  total: number
  completed: number
  noShow: number
  canceled: number
  /** Tasa de no-show sobre turnos jugados (completed + no_show), 0–100. */
  noShowRate: number
}

export async function getPlayerStats(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<PlayerStats> {
  const rows = await tx.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
      COUNT(*) FILTER (WHERE status IN ('canceled_refunded','canceled_no_refund'))::int AS canceled
    FROM bookings
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `)
  const r = (rows as unknown as Array<{ total: number; completed: number; no_show: number; canceled: number }>)[0]
  const total = r?.total ?? 0
  const completed = r?.completed ?? 0
  const noShow = r?.no_show ?? 0
  const canceled = r?.canceled ?? 0
  const played = completed + noShow
  const noShowRate = played > 0 ? Math.round((noShow / played) * 100) : 0
  return { total, completed, noShow, canceled, noShowRate }
}

export type PlayerAbonado = {
  id: string
  status: string
  dayOfWeek: number
  timeStart: string
  timeEnd: string
  pricePerSession: number
  creditBalance: number
  courtName: string
}

export async function getPlayerAbonados(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<PlayerAbonado[]> {
  const rows = await tx.execute(sql`
    SELECT a.id, a.status, a.day_of_week AS "dayOfWeek",
           a.time_start::text AS "timeStart", a.time_end::text AS "timeEnd",
           a.price_per_session AS "pricePerSession",
           a.credit_balance AS "creditBalance",
           c.name AS "courtName"
    FROM abonados a
    JOIN courts c ON c.id = a.court_id
    WHERE a.tenant_id = ${tenantId} AND a.player_id = ${playerId}
    ORDER BY (a.status = 'active') DESC, a.day_of_week, a.time_start
  `)
  return rows as unknown as PlayerAbonado[]
}

export type PlayerBookingRow = {
  id: string
  date: string
  timeStart: string
  timeEnd: string
  status: string
  type: string
  priceSnapshot: number
  courtName: string
}

export async function getPlayerBookingHistory(
  tenantId: string,
  playerId: string,
  tx: DbTx,
  limit = 20,
): Promise<PlayerBookingRow[]> {
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date,
           b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           c.name AS "courtName"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    WHERE b.tenant_id = ${tenantId} AND b.player_id = ${playerId}
    ORDER BY b.date DESC, b.time_start DESC
    LIMIT ${limit}
  `)
  return rows as unknown as PlayerBookingRow[]
}
