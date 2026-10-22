import { sql, type SQL } from 'drizzle-orm'
import { withDisposableWorkerDb, type Db } from '@/shared/db/client'
import { artDateOf, artDayRangeUtc } from '@/shared/time/art-date'

/**
 * Monitor del bot de WhatsApp para el dueño (`/super-admin/whatsapp`) y base del
 * cron de alertas. Todo es conteo y timestamps: jamás cuerpos de mensaje,
 * teléfonos ni nombres de contactos (Ley 25.326).
 *
 * Lecturas cross-tenant con el pool worker (BYPASSRLS), por un cliente
 * descartable como el del dashboard. Las fechas van como literal y no como
 * parámetro por el mismo motivo que `getMrrCents` (dashboard.service.ts): con
 * `prepare: false` una query con parámetros puede quedar colgada en el pooler.
 */

/** Mensajes por mes del plan de Kapso (plan Free; Pro = 100.000). Entrantes y salientes. */
export const KAPSO_PLAN_MONTHLY_MESSAGES = 2000

/**
 * Precio de Claude Haiku 5.5 en USD por millón de tokens (fuente: la página de
 * precios de Anthropic, consultada el 2026-10-21). La lectura de caché cuesta el
 * 10% de la entrada.
 */
const HAIKU_USD_PER_MTOK = { input: 0.1, cached: 0.01, output: 0.5 } as const

const DAY_MS = 24 * 3600_000
const MONTHLY_READ_TIMEOUT_MS = 10_000

type TokenCounts = { input: number; cached: number; output: number }

/** Gasto estimado de Anthropic a partir de los tokens guardados. Anthropic no expone el saldo. */
export function tokensToUsd(t: TokenCounts): number {
  return (
    (t.input * HAIKU_USD_PER_MTOK.input +
      t.cached * HAIKU_USD_PER_MTOK.cached +
      t.output * HAIKU_USD_PER_MTOK.output) /
    1_000_000
  )
}

type MonthWindow = { ym: string; fromUtc: Date; toUtc: Date; daysInMonth: number }

/** Mes calendario en hora argentina que contiene a `now`: [fromUtc, toUtc). */
export function monthWindowArt(now: Date): MonthWindow {
  const ym = artDateOf(now).slice(0, 7)
  const [year, month] = ym.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const { fromUtc, toUtc } = artDayRangeUtc(
    `${ym}-01`,
    `${ym}-${String(daysInMonth).padStart(2, '0')}`,
  )
  return { ym, fromUtc, toUtc, daysInMonth }
}

/**
 * Proyección lineal a fin de mes y día del mes en que se pasaría `limit`
 * (`null` si la proyección no lo alcanza). Los días transcurridos tienen piso
 * de 1: el día 1 a la madrugada no extrapola dos mensajes a todo el mes.
 */
export function projectMonth(args: {
  total: number
  limit: number
  window: MonthWindow
  now: Date
}): { projected: number; crossingDay: number | null } {
  const { total, limit, window, now } = args
  const elapsedDays = Math.max(1, (now.getTime() - window.fromUtc.getTime()) / DAY_MS)
  const perDay = total / elapsedDays
  const projected = perDay * window.daysInMonth
  if (projected <= limit) return { projected, crossingDay: null }
  return { projected, crossingDay: Math.min(window.daysInMonth, Math.ceil(limit / perDay)) }
}

/** Literal de instante: ver el comentario de arriba sobre los parámetros. */
function tsLiteral(d: Date): SQL {
  return sql.raw(`'${d.toISOString()}'::timestamptz`)
}

type Direction = 'inbound' | 'outbound' | 'owner'

type PausedByReason = Record<string, number>

export type WhatsappTenantHealth = {
  tenantId: string
  name: string
  slug: string
  displayPhoneNumber: string | null
  status: 'connected' | 'disconnected'
  enabled: boolean
  lastInboundAt: Date | null
  lastOutboundAt: Date | null
  /** Entrantes sin procesar de hace más de 2 min y menos de 6 h. */
  backlog: number
  pausedByReason: PausedByReason
  monthMessages: number
  monthUsd: number
  /** Reservas del mes nacidas en el bot, y cuántas ya tienen la seña pagada. */
  botBookings: number
  botBookingsDepositPaid: number
}

export type WhatsappMonitor = {
  month: string
  kapso: {
    total: number
    byDirection: Record<Direction, number>
    limit: number
    /** Sin redondear: 0–100+. */
    pct: number
    projected: number
    crossingDay: number | null
    daysInMonth: number
  }
  anthropic: { tokens: TokenCounts; costUsd: number; projectedUsd: number }
  tenants: WhatsappTenantHealth[]
}

type Rows<T> = T[]

function asDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null
  return v instanceof Date ? v : new Date(String(v))
}

/** Mensajes del mes (todas las direcciones) — la aproximación del contador de Kapso. */
export async function getMonthMessageTotal(db: Db, now: Date): Promise<number> {
  const w = monthWindowArt(now)
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM whatsapp_messages
    WHERE created_at >= ${tsLiteral(w.fromUtc)} AND created_at < ${tsLiteral(w.toUtc)}
  `)) as unknown as Rows<{ total: number }>
  return rows[0]?.total ?? 0
}

/** Entrantes sin procesar de hace más de `minMinutes` y menos de 6 h (la ventana de rescate). */
export async function countInboundBacklog(db: Db, minMinutes: number): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM whatsapp_messages
    WHERE direction = 'inbound' AND processed_at IS NULL
      AND created_at < now() - ${sql.raw(`interval '${Math.floor(minMinutes)} minutes'`)}
      AND created_at > now() - interval '6 hours'
  `)) as unknown as Rows<{ total: number }>
  return rows[0]?.total ?? 0
}

/** Chats que el bot pausó por un error propio y siguen pausados. */
export async function countBotErrorPaused(db: Db): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM whatsapp_chats
    WHERE pause_reason = 'bot_error' AND paused_until > now()
  `)) as unknown as Rows<{ total: number }>
  return rows[0]?.total ?? 0
}

async function readMonitor(db: Db, now: Date): Promise<WhatsappMonitor> {
  const w = monthWindowArt(now)
  const from = tsLiteral(w.fromUtc)
  const to = tsLiteral(w.toUtc)

  const [conns, usage, health, paused, bookings] = await Promise.all([
    db.execute(sql`
      SELECT c.tenant_id AS "tenantId", t.name, t.slug,
             c.display_phone_number AS "displayPhoneNumber", c.status, c.enabled
      FROM whatsapp_connections c
      JOIN tenants t ON t.id = c.tenant_id
      ORDER BY t.name
    `),
    db.execute(sql`
      SELECT tenant_id AS "tenantId", direction,
             COUNT(*)::int AS messages,
             COALESCE(SUM(input_tokens), 0)::float8 AS input,
             COALESCE(SUM(cached_tokens), 0)::float8 AS cached,
             COALESCE(SUM(output_tokens), 0)::float8 AS output
      FROM whatsapp_messages
      WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY tenant_id, direction
    `),
    db.execute(sql`
      SELECT tenant_id AS "tenantId",
             MAX(created_at) FILTER (WHERE direction = 'inbound') AS "lastInboundAt",
             MAX(created_at) FILTER (WHERE direction = 'outbound') AS "lastOutboundAt",
             COUNT(*) FILTER (
               WHERE direction = 'inbound' AND processed_at IS NULL
                 AND created_at < now() - interval '2 minutes'
                 AND created_at > now() - interval '6 hours'
             )::int AS backlog
      FROM whatsapp_messages
      GROUP BY tenant_id
    `),
    db.execute(sql`
      SELECT tenant_id AS "tenantId", pause_reason AS reason, COUNT(*)::int AS chats
      FROM whatsapp_chats
      WHERE paused_until > now() AND pause_reason IS NOT NULL
      GROUP BY tenant_id, pause_reason
    `),
    db.execute(sql`
      SELECT tenant_id AS "tenantId", COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE deposit_status IN ('paid', 'captured'))::int AS "depositPaid"
      FROM bookings
      WHERE whatsapp_chat_id IS NOT NULL AND created_at >= ${from} AND created_at < ${to}
      GROUP BY tenant_id
    `),
  ])

  const byDirection: Record<Direction, number> = { inbound: 0, outbound: 0, owner: 0 }
  const tokens: TokenCounts = { input: 0, cached: 0, output: 0 }
  const perTenant = new Map<string, { messages: number; tokens: TokenCounts }>()
  for (const r of usage as unknown as Rows<{
    tenantId: string
    direction: Direction
    messages: number
    input: number
    cached: number
    output: number
  }>) {
    byDirection[r.direction] += r.messages
    tokens.input += r.input
    tokens.cached += r.cached
    tokens.output += r.output
    const t = perTenant.get(r.tenantId) ?? {
      messages: 0,
      tokens: { input: 0, cached: 0, output: 0 },
    }
    t.messages += r.messages
    t.tokens.input += r.input
    t.tokens.cached += r.cached
    t.tokens.output += r.output
    perTenant.set(r.tenantId, t)
  }

  const healthBy = new Map(
    (
      health as unknown as Rows<{
        tenantId: string
        lastInboundAt: unknown
        lastOutboundAt: unknown
        backlog: number
      }>
    ).map((r) => [r.tenantId, r]),
  )
  const pausedBy = new Map<string, PausedByReason>()
  for (const r of paused as unknown as Rows<{ tenantId: string; reason: string; chats: number }>) {
    pausedBy.set(r.tenantId, { ...pausedBy.get(r.tenantId), [r.reason]: r.chats })
  }
  const bookingsBy = new Map(
    (bookings as unknown as Rows<{ tenantId: string; total: number; depositPaid: number }>).map(
      (r) => [r.tenantId, r],
    ),
  )

  const total = byDirection.inbound + byDirection.outbound + byDirection.owner
  const { projected, crossingDay } = projectMonth({
    total,
    limit: KAPSO_PLAN_MONTHLY_MESSAGES,
    window: w,
    now,
  })
  const costUsd = tokensToUsd(tokens)
  const elapsedDays = Math.max(1, (now.getTime() - w.fromUtc.getTime()) / DAY_MS)

  return {
    month: w.ym,
    kapso: {
      total,
      byDirection,
      limit: KAPSO_PLAN_MONTHLY_MESSAGES,
      pct: (total / KAPSO_PLAN_MONTHLY_MESSAGES) * 100,
      projected,
      crossingDay,
      daysInMonth: w.daysInMonth,
    },
    anthropic: { tokens, costUsd, projectedUsd: (costUsd / elapsedDays) * w.daysInMonth },
    tenants: (
      conns as unknown as Rows<{
        tenantId: string
        name: string
        slug: string
        displayPhoneNumber: string | null
        status: 'connected' | 'disconnected'
        enabled: boolean
      }>
    ).map((c) => {
      const h = healthBy.get(c.tenantId)
      const u = perTenant.get(c.tenantId)
      const b = bookingsBy.get(c.tenantId)
      return {
        ...c,
        lastInboundAt: asDate(h?.lastInboundAt),
        lastOutboundAt: asDate(h?.lastOutboundAt),
        backlog: h?.backlog ?? 0,
        pausedByReason: pausedBy.get(c.tenantId) ?? {},
        monthMessages: u?.messages ?? 0,
        monthUsd: u ? tokensToUsd(u.tokens) : 0,
        botBookings: b?.total ?? 0,
        botBookingsDepositPaid: b?.depositPaid ?? 0,
      }
    }),
  }
}

/** Foto del bot para la página del super-admin. Rechaza si no llega a leer a tiempo. */
export function getWhatsappMonitor(now: Date = new Date()): Promise<WhatsappMonitor> {
  return withDisposableWorkerDb(MONTHLY_READ_TIMEOUT_MS, (db) => readMonitor(db, now))
}
