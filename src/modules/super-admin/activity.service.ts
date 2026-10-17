import { sql } from 'drizzle-orm'
import { withDisposableWorkerDb, type Db } from '@/shared/db/client'
import { addDays } from '@/shared/dates/art'
import { artDateOf, artDayRangeUtc } from '@/shared/time/art-date'

/**
 * Pulso de la plataforma para el panel super-admin: quién entró y qué se
 * reservó, por día ART. Nace del 2026-10-16: El Vagón publicó su link, entraron
 * 10 jugadores y 9 reservas online, y el panel no mostró nada.
 *
 * `players` y `bookings` no tienen policy de lectura para el system admin
 * (006_rls_policies.sql): toda lectura cross-tenant va por el rol worker, con
 * un cliente descartable y tope (`withDisposableWorkerDb`), igual que el MRR.
 * Decisión del dueño 2026-10-16: sin migración de policies.
 *
 * Reserva online = la hizo un jugador desde el portal:
 * `type = 'spontaneous' AND created_by_staff IS NULL AND player_id IS NOT NULL`
 * (mismo predicado que `home.service.ts`; los turnos fijos también nacen con
 * `created_by_staff` NULL, por eso el `type`). Las que vencieron esperando la
 * seña (`expired`) no cuentan: el jugador abandonó el pago y el turno nunca
 * existió para el complejo.
 */

const ACTIVITY_WINDOWS = ['hoy', '7d', '30d'] as const
export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number]

export function isActivityWindow(value: string | undefined): value is ActivityWindow {
  return (ACTIVITY_WINDOWS as readonly string[]).includes(value ?? '')
}

const WINDOW_DAYS: Record<ActivityWindow, number> = { hoy: 1, '7d': 7, '30d': 30 }

/** Días de la serie diaria del Pulso. */
const SERIES_DAYS = 14

type ActivityCounts = {
  newPlayers: number
  onlineBookings: number
  /** Turnos y eventos cargados por el staff desde el panel (sin bloqueos). */
  staffBookings: number
  /** Complejos con al menos una reserva creada en la ventana. */
  activeTenants: number
}

export type ActivityDay = {
  /** 'YYYY-MM-DD' en ART. */
  day: string
  newPlayers: number
  onlineBookings: number
}

type RecentOnlineBooking = {
  id: string
  createdAt: Date
  tenantId: string
  tenantName: string
  courtName: string | null
  /** Día operativo 'YYYY-MM-DD'. */
  date: string
  timeStart: string
  timeEnd: string
  status: string
  depositStatus: string | null
  playerId: string
  playerName: string
}

export type RecentPlayer = {
  id: string
  name: string
  status: 'active' | 'banned' | 'anonymized'
  createdAt: Date
  /** El primer complejo donde apareció (relación más vieja). `null` = todavía en ninguno. */
  firstTenantName: string | null
}

export type PlatformActivity = {
  window: ActivityWindow
  current: ActivityCounts
  /** La ventana anterior del mismo largo, como referencia (sin porcentaje). */
  previous: ActivityCounts
  series: ActivityDay[]
  recentOnlineBookings: RecentOnlineBooking[]
  recentPlayers: RecentPlayer[]
}

/**
 * Un instante como parámetro de SQL crudo. `db.execute` no pasa por el mapeo
 * de tipos de Drizzle y postgres.js, con `prepare: false`, revienta al
 * serializar un `Date` contra el tipo que le describe el servidor: va como
 * ISO con cast explícito (mismo patrón que los tests de integración).
 */
export function pgTs(value: Date) {
  return sql`${value.toISOString()}::timestamptz`
}

const ONLINE_BOOKING = sql`b.type = 'spontaneous' AND b.created_by_staff IS NULL AND b.player_id IS NOT NULL AND b.status <> 'expired'`

/**
 * Bordes UTC de la ventana actual y de la anterior. "7 días" son hoy y los
 * seis anteriores, enteros en ART: así un número no cambia de significado según
 * la hora a la que se mire.
 */
function activityRanges(window: ActivityWindow, today: string) {
  const days = WINDOW_DAYS[window]
  const from = addDays(today, -(days - 1))
  const current = artDayRangeUtc(from, today)
  const previous = artDayRangeUtc(addDays(from, -days), addDays(from, -1))
  return { current, previous }
}

async function countActivity(db: Db, fromUtc: Date, toUtc: Date): Promise<ActivityCounts> {
  const rows = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM players p
        WHERE p.created_at >= ${pgTs(fromUtc)} AND p.created_at < ${pgTs(toUtc)}) AS new_players,
      (SELECT COUNT(*)::int FROM bookings b
        WHERE ${ONLINE_BOOKING} AND b.created_at >= ${pgTs(fromUtc)} AND b.created_at < ${pgTs(toUtc)}) AS online_bookings,
      (SELECT COUNT(*)::int FROM bookings b
        WHERE b.created_by_staff IS NOT NULL AND b.type = 'spontaneous'
          AND b.created_at >= ${pgTs(fromUtc)} AND b.created_at < ${pgTs(toUtc)}) AS staff_bookings,
      (SELECT COUNT(DISTINCT b.tenant_id)::int FROM bookings b
        WHERE b.type <> 'block' AND b.status <> 'expired' AND b.created_at >= ${pgTs(fromUtc)} AND b.created_at < ${pgTs(toUtc)}) AS active_tenants
  `)) as unknown as Array<{
    new_players: number
    online_bookings: number
    staff_bookings: number
    active_tenants: number
  }>
  const r = rows[0]
  return {
    newPlayers: r?.new_players ?? 0,
    onlineBookings: r?.online_bookings ?? 0,
    staffBookings: r?.staff_bookings ?? 0,
    activeTenants: r?.active_tenants ?? 0,
  }
}

/** Altas de jugadores y reservas online por día ART, con los días en cero incluidos. */
export async function dailySeries(db: Db, today: string, days: number): Promise<ActivityDay[]> {
  const from = addDays(today, -(days - 1))
  const { fromUtc, toUtc } = artDayRangeUtc(from, today)
  const rows = (await db.execute(sql`
    WITH p AS (
      SELECT (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day, COUNT(*)::int AS n
      FROM players WHERE created_at >= ${pgTs(fromUtc)} AND created_at < ${pgTs(toUtc)}
      GROUP BY 1
    ), o AS (
      SELECT (b.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day, COUNT(*)::int AS n
      FROM bookings b WHERE ${ONLINE_BOOKING} AND b.created_at >= ${pgTs(fromUtc)} AND b.created_at < ${pgTs(toUtc)}
      GROUP BY 1
    )
    SELECT to_char(p.day, 'YYYY-MM-DD') AS day, p.n AS players, 0 AS online FROM p
    UNION ALL
    SELECT to_char(o.day, 'YYYY-MM-DD'), 0, o.n FROM o
  `)) as unknown as Array<{ day: string; players: number; online: number }>

  const byDay = new Map<string, ActivityDay>()
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i)
    byDay.set(day, { day, newPlayers: 0, onlineBookings: 0 })
  }
  for (const r of rows) {
    const entry = byDay.get(r.day)
    if (!entry) continue
    entry.newPlayers += r.players
    entry.onlineBookings += r.online
  }
  return [...byDay.values()]
}

async function recentOnlineBookings(db: Db, limit: number): Promise<RecentOnlineBooking[]> {
  const rows = (await db.execute(sql`
    SELECT b.id, b.created_at, b.tenant_id, t.name AS tenant_name, c.name AS court_name,
           to_char(b.date, 'YYYY-MM-DD') AS date, b.time_start, b.time_end, b.status,
           b.deposit_status, b.player_id, p.first_name, p.last_name, p.status AS player_status
    FROM bookings b
    JOIN tenants t ON t.id = b.tenant_id
    JOIN players p ON p.id = b.player_id
    LEFT JOIN courts c ON c.id = b.court_id
    WHERE ${ONLINE_BOOKING}
    ORDER BY b.created_at DESC
    LIMIT ${limit}::int
  `)) as unknown as Array<{
    id: string
    created_at: Date | string
    tenant_id: string
    tenant_name: string
    court_name: string | null
    date: string
    time_start: string
    time_end: string
    status: string
    deposit_status: string | null
    player_id: string
    first_name: string
    last_name: string
    player_status: RecentPlayer['status']
  }>
  return rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at),
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    courtName: r.court_name,
    date: r.date,
    timeStart: r.time_start,
    timeEnd: r.time_end,
    status: r.status,
    depositStatus: r.deposit_status,
    playerId: r.player_id,
    playerName: playerDisplayName(r.first_name, r.last_name, r.player_status),
  }))
}

async function recentPlayers(db: Db, limit: number): Promise<RecentPlayer[]> {
  const rows = (await db.execute(sql`
    SELECT p.id, p.first_name, p.last_name, p.status, p.created_at,
      (SELECT t.name FROM player_tenant_relationships r JOIN tenants t ON t.id = r.tenant_id
        WHERE r.player_id = p.id ORDER BY r.first_seen_at ASC LIMIT 1) AS first_tenant_name
    FROM players p
    ORDER BY p.created_at DESC
    LIMIT ${limit}::int
  `)) as unknown as Array<{
    id: string
    first_name: string
    last_name: string
    status: RecentPlayer['status']
    created_at: Date | string
    first_tenant_name: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    name: playerDisplayName(r.first_name, r.last_name, r.status),
    status: r.status,
    createdAt: new Date(r.created_at),
    firstTenantName: r.first_tenant_name,
  }))
}

/**
 * Nombre para mostrar. Un jugador anonimizado (ARCO, Ley 25.326) ya no tiene
 * nombre: la anonimización pisa los datos y el panel no los reconstruye.
 */
export function playerDisplayName(
  firstName: string,
  lastName: string,
  status: RecentPlayer['status'],
): string {
  if (status === 'anonymized') return 'Jugador anonimizado'
  return `${firstName} ${lastName}`.trim() || 'Sin nombre'
}

/** Tope del bloque de actividad: debajo de los 15 s de la page. */
const ACTIVITY_TIMEOUT_MS = 8_000

export async function getPlatformActivity(window: ActivityWindow): Promise<PlatformActivity> {
  const today = artDateOf(new Date())
  const ranges = activityRanges(window, today)
  return withDisposableWorkerDb(ACTIVITY_TIMEOUT_MS, async (db) => {
    const [current, previous, series, bookingsFeed, playersFeed] = await Promise.all([
      countActivity(db, ranges.current.fromUtc, ranges.current.toUtc),
      countActivity(db, ranges.previous.fromUtc, ranges.previous.toUtc),
      dailySeries(db, today, SERIES_DAYS),
      recentOnlineBookings(db, 8),
      recentPlayers(db, 8),
    ])
    return {
      window,
      current,
      previous,
      series,
      recentOnlineBookings: bookingsFeed,
      recentPlayers: playersFeed,
    }
  })
}
