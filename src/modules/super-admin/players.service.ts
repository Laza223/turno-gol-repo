import { sql, type SQL } from 'drizzle-orm'
import { withDisposableWorkerDb, type Db } from '@/shared/db/client'
import { addDays } from '@/shared/dates/art'
import { artDateOf, artDayRangeUtc } from '@/shared/time/art-date'
import { PLAYER_TAGS, type PlayerTag } from '@/modules/relationships/player-tags'
import { dailySeries, pgTs, playerDisplayName, type ActivityDay } from './activity.service'

/**
 * Jugadores de toda la plataforma para el panel super-admin.
 *
 * Mismo régimen que `activity.service.ts`: `players`, `bookings` y
 * `player_tenant_relationships` no tienen policy para el system admin, así que
 * se leen con el rol worker en un cliente descartable con tope.
 *
 * Ley 25.326: el panel muestra solo columnas estructuradas. Nunca salen de acá
 * `players.ban_reason`, `tenant_player_bans.reason`, `bookings.notes_player`
 * ni `bookings.notes_internal` (texto libre sobre personas). Un jugador
 * anonimizado no muestra contacto: la anonimización ya pisó los datos y el
 * panel no los exhibe como si fueran reales.
 */

export type PlayerStatus = 'active' | 'banned' | 'anonymized'

const PLAYER_FILTERS = ['todos', 'nuevos', 'con-reservas', 'bloqueados'] as const
export type PlayerFilter = (typeof PLAYER_FILTERS)[number]

export function isPlayerFilter(value: string | undefined): value is PlayerFilter {
  return (PLAYER_FILTERS as readonly string[]).includes(value ?? '')
}

export type PlayerStats = {
  total: number
  newToday: number
  new7d: number
  new30d: number
  /** Entraron (login) en los últimos 7 días. */
  active7d: number
  /** Altas por día de los últimos 30 días ART. */
  series: ActivityDay[]
}

export type PlayerListRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: PlayerStatus
  createdAt: Date
  lastLoginAt: Date | null
  tenantsCount: number
  bookingsCount: number
}

export type PlayerList = {
  rows: PlayerListRow[]
  total: number
  /** 0-based, como el `Pager`. */
  page: number
  pageSize: number
}

export type PlayerTenantLink = {
  tenantId: string
  tenantName: string
  firstSeenAt: Date
  lastBookingAt: Date | null
  bookingsCount: number
  noshowCount: number
  /** `blocked` = el complejo lo bloqueó (relación), aparte de un ban temporal. */
  relationshipStatus: 'active' | 'blocked'
  tags: PlayerTag[]
  /** Ban del complejo vigente: hasta cuándo (`null` = sin fecha de fin). */
  bannedUntil: Date | null
  isBanned: boolean
}

export type PlayerBookingRow = {
  id: string
  tenantName: string
  courtName: string | null
  date: string
  timeStart: string
  timeEnd: string
  status: string
  type: string
  depositStatus: string | null
  /** true = la reservó el jugador desde el portal; false = la cargó el complejo. */
  online: boolean
  priceSnapshot: number
  createdAt: Date
}

export type PlayerDetail = {
  player: {
    id: string
    name: string
    email: string | null
    phone: string | null
    status: PlayerStatus
    createdAt: Date
    lastLoginAt: Date | null
    agreedToTermsAt: Date | null
    termsVersion: string | null
    /** Ban global del sistema (`status = 'banned'`): hasta cuándo, sin el motivo. */
    banUntil: Date | null
  }
  tenants: PlayerTenantLink[]
  bookings: PlayerBookingRow[]
  bookingsTotal: number
  /** 0-based. */
  bookingsPage: number
  bookingsPageSize: number
}

const READ_TIMEOUT_MS = 8_000

/** Días de la serie de altas de la sección Jugadores. */
const STATS_SERIES_DAYS = 30

export async function getPlayerStats(): Promise<PlayerStats> {
  const today = artDateOf(new Date())
  const todayRange = artDayRangeUtc(today)
  const from7 = artDayRangeUtc(addDays(today, -6), today).fromUtc
  const from30 = artDayRangeUtc(addDays(today, -29), today).fromUtc
  const login7 = new Date(Date.now() - 7 * 24 * 3600_000)

  return withDisposableWorkerDb(READ_TIMEOUT_MS, async (db) => {
    const [countRows, series] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE created_at >= ${pgTs(todayRange.fromUtc)} AND created_at < ${pgTs(todayRange.toUtc)})::int AS new_today,
          COUNT(*) FILTER (WHERE created_at >= ${pgTs(from7)})::int AS new_7d,
          COUNT(*) FILTER (WHERE created_at >= ${pgTs(from30)})::int AS new_30d,
          COUNT(*) FILTER (WHERE last_login_at >= ${pgTs(login7)})::int AS active_7d
        FROM players
      `),
      dailySeries(db, today, STATS_SERIES_DAYS),
    ])
    const r = (
      countRows as unknown as Array<{
        total: number
        new_today: number
        new_7d: number
        new_30d: number
        active_7d: number
      }>
    )[0]
    return {
      total: r?.total ?? 0,
      newToday: r?.new_today ?? 0,
      new7d: r?.new_7d ?? 0,
      new30d: r?.new_30d ?? 0,
      active7d: r?.active_7d ?? 0,
      series,
    }
  })
}

function contactOf(status: PlayerStatus, value: string | null): string | null {
  return status === 'anonymized' ? null : value
}

export async function listPlayers(opts: {
  q?: string
  filter: PlayerFilter
  page: number
  pageSize: number
}): Promise<PlayerList> {
  const conditions: SQL[] = []
  const q = opts.q?.trim()
  if (q) {
    // `%` y `_` son comodines de ILIKE: escapados (con la barra invertida, el
    // escape por defecto), buscar "_" no trae a todos los jugadores.
    const esc = String.fromCharCode(92)
    const needle = `%${[...q].map((c) => ('%_'.includes(c) || c === esc ? esc + c : c)).join('')}%`
    conditions.push(
      sql`((p.first_name || ' ' || p.last_name) ILIKE ${needle} OR p.email ILIKE ${needle} OR p.phone ILIKE ${needle})`,
    )
  }
  if (opts.filter === 'nuevos') {
    const today = artDateOf(new Date())
    const { fromUtc } = artDayRangeUtc(addDays(today, -6), today)
    conditions.push(sql`p.created_at >= ${pgTs(fromUtc)}`)
  } else if (opts.filter === 'con-reservas') {
    conditions.push(sql`EXISTS (SELECT 1 FROM bookings b WHERE b.player_id = p.id)`)
  } else if (opts.filter === 'bloqueados') {
    conditions.push(sql`p.status = 'banned'`)
  }
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``

  return withDisposableWorkerDb(READ_TIMEOUT_MS, async (db) => {
    const [rows, totals] = await Promise.all([
      db.execute(sql`
        SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.status, p.created_at, p.last_login_at,
          (SELECT COUNT(*)::int FROM player_tenant_relationships r WHERE r.player_id = p.id) AS tenants_count,
          (SELECT COUNT(*)::int FROM bookings b WHERE b.player_id = p.id) AS bookings_count
        FROM players p
        ${where}
        ORDER BY p.created_at DESC
        LIMIT ${opts.pageSize}::int OFFSET ${opts.page * opts.pageSize}::int
      `),
      db.execute(sql`SELECT COUNT(*)::int AS total FROM players p ${where}`),
    ])
    return {
      rows: (
        rows as unknown as Array<{
          id: string
          first_name: string
          last_name: string
          email: string
          phone: string | null
          status: PlayerStatus
          created_at: Date | string
          last_login_at: Date | string | null
          tenants_count: number
          bookings_count: number
        }>
      ).map((r) => ({
        id: r.id,
        name: playerDisplayName(r.first_name, r.last_name, r.status),
        email: contactOf(r.status, r.email),
        phone: contactOf(r.status, r.phone),
        status: r.status,
        createdAt: new Date(r.created_at),
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : null,
        tenantsCount: r.tenants_count,
        bookingsCount: r.bookings_count,
      })),
      total: (totals as unknown as Array<{ total: number }>)[0]?.total ?? 0,
      page: opts.page,
      pageSize: opts.pageSize,
    }
  })
}

async function playerBookings(
  db: Db,
  playerId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: PlayerBookingRow[]; total: number }> {
  const [rows, totals] = await Promise.all([
    db.execute(sql`
      SELECT b.id, t.name AS tenant_name, c.name AS court_name, to_char(b.date, 'YYYY-MM-DD') AS date,
        b.time_start, b.time_end, b.status, b.type, b.deposit_status, b.created_by_staff,
        b.price_snapshot, b.created_at
      FROM bookings b
      JOIN tenants t ON t.id = b.tenant_id
      LEFT JOIN courts c ON c.id = b.court_id
      WHERE b.player_id = ${playerId}
      ORDER BY b.starts_at DESC NULLS LAST, b.created_at DESC
      LIMIT ${pageSize}::int OFFSET ${page * pageSize}::int
    `),
    db.execute(sql`SELECT COUNT(*)::int AS total FROM bookings WHERE player_id = ${playerId}`),
  ])
  return {
    rows: (
      rows as unknown as Array<{
        id: string
        tenant_name: string
        court_name: string | null
        date: string
        time_start: string
        time_end: string
        status: string
        type: string
        deposit_status: string | null
        created_by_staff: string | null
        price_snapshot: number
        created_at: Date | string
      }>
    ).map((r) => ({
      id: r.id,
      tenantName: r.tenant_name,
      courtName: r.court_name,
      date: r.date,
      timeStart: r.time_start,
      timeEnd: r.time_end,
      status: r.status,
      type: r.type,
      depositStatus: r.deposit_status,
      online: r.type === 'spontaneous' && r.created_by_staff === null,
      priceSnapshot: r.price_snapshot,
      createdAt: new Date(r.created_at),
    })),
    total: (totals as unknown as Array<{ total: number }>)[0]?.total ?? 0,
  }
}

export async function getPlayerDetail(
  playerId: string,
  opts: { page: number; pageSize: number },
): Promise<PlayerDetail | null> {
  return withDisposableWorkerDb(READ_TIMEOUT_MS, async (db) => {
    const playerRows = (await db.execute(sql`
      SELECT id, first_name, last_name, email, phone, status, created_at, last_login_at,
        agreed_to_terms_at, terms_version, ban_until
      FROM players WHERE id = ${playerId}
    `)) as unknown as Array<{
      id: string
      first_name: string
      last_name: string
      email: string
      phone: string | null
      status: PlayerStatus
      created_at: Date | string
      last_login_at: Date | string | null
      agreed_to_terms_at: Date | string | null
      terms_version: string | null
      ban_until: Date | string | null
    }>
    const p = playerRows[0]
    if (!p) return null

    const [linkRows, history] = await Promise.all([
      db.execute(sql`
        SELECT r.tenant_id, t.name AS tenant_name, r.first_seen_at, r.last_booking_at,
          r.bookings_count, r.noshow_count, r.status, r.tags,
          ban.banned_until, (ban.id IS NOT NULL) AS is_banned
        FROM player_tenant_relationships r
        JOIN tenants t ON t.id = r.tenant_id
        LEFT JOIN LATERAL (
          SELECT tb.id, tb.banned_until FROM tenant_player_bans tb
          WHERE tb.tenant_id = r.tenant_id AND tb.player_id = r.player_id
            AND (tb.banned_until IS NULL OR tb.banned_until > now())
          ORDER BY tb.banned_at DESC LIMIT 1
        ) ban ON true
        WHERE r.player_id = ${playerId}
        ORDER BY r.first_seen_at ASC
      `),
      playerBookings(db, playerId, opts.page, opts.pageSize),
    ])

    const toDate = (v: Date | string | null) => (v ? new Date(v) : null)
    return {
      player: {
        id: p.id,
        name: playerDisplayName(p.first_name, p.last_name, p.status),
        email: contactOf(p.status, p.email),
        phone: contactOf(p.status, p.phone),
        status: p.status,
        createdAt: new Date(p.created_at),
        lastLoginAt: toDate(p.last_login_at),
        agreedToTermsAt: toDate(p.agreed_to_terms_at),
        termsVersion: p.terms_version,
        banUntil: p.status === 'banned' ? toDate(p.ban_until) : null,
      },
      tenants: (
        linkRows as unknown as Array<{
          tenant_id: string
          tenant_name: string
          first_seen_at: Date | string
          last_booking_at: Date | string | null
          bookings_count: number
          noshow_count: number
          status: 'active' | 'blocked'
          tags: PlayerTag[] | string | null
          banned_until: Date | string | null
          is_banned: boolean
        }>
      ).map((r) => ({
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        firstSeenAt: new Date(r.first_seen_at),
        lastBookingAt: toDate(r.last_booking_at),
        bookingsCount: r.bookings_count,
        noshowCount: r.noshow_count,
        relationshipStatus: r.status,
        tags: parsePgArray(r.tags),
        bannedUntil: toDate(r.banned_until),
        isBanned: r.is_banned,
      })),
      bookings: history.rows,
      bookingsTotal: history.total,
      bookingsPage: opts.page,
      bookingsPageSize: opts.pageSize,
    }
  })
}

/**
 * Un array de enum de Postgres llega por `execute` crudo como literal de texto
 * (`{gets_credit,difficult}`): postgres.js no conoce el OID del tipo y no lo
 * parsea. Con el mismo dato ya parseado (otro driver, otra versión) pasa tal cual.
 */
function parsePgArray(value: PlayerTag[] | string | null): PlayerTag[] {
  if (value === null) return []
  const raw = Array.isArray(value) ? value : value.replace(/^\{|\}$/g, '').split(',')
  return raw.filter((t): t is PlayerTag => (PLAYER_TAGS as readonly string[]).includes(t))
}
