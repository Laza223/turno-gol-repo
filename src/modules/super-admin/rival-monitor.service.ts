import { sql, type SQL } from 'drizzle-orm'
import { withDisposableWorkerDb, type Db } from '@/shared/db/client'
import type { RivalReportReason } from '@/modules/rival/rival.schema'

/**
 * Panel del dueño de RIVAL (`/super-admin/rival`, spec §8 y §11): métricas agregadas y la
 * lista de partidos denunciados. Solo conteos, nombres cortos y motivos cerrados: jamás
 * teléfono, email, `invite_code` ni texto libre sobre personas (Ley 25.326).
 *
 * Las tablas `rival_*` tienen RLS solo por `app.current_player_id`, así que el panel lee
 * con el pool worker (BYPASSRLS), por un cliente descartable como el monitor de WhatsApp.
 * Los instantes van como literal y no como parámetro por el mismo motivo que allá
 * (`prepare: false` + pooler).
 *
 * Datos que NO existen en el schema y por eso no se muestran: el `?ref=` de las cuentas
 * (solo hay `players.signup_source`), las bajas de suscripciones a alertas (la baja borra
 * la fila: solo se sabe cuántas hay activas) y las bajas / entradas desde el banco de los
 * partidos (`left` y la promoción no sellan `decided_at`; falta una migración con `left_at`
 * y un sello en la promoción). Nunca se muestra un 0 que no sea medido.
 */

const READ_TIMEOUT_MS = 10_000
const WEEKS = 8
const MAX_REPORTED_MATCHES = 100
const ART = `'America/Argentina/Buenos_Aires'`
const DAY_MS = 24 * 3600_000

export type RivalWeek = {
  /** Lunes de la semana, hora argentina (YYYY-MM-DD). */
  week: string
  matchesCreated: number
  matchesOnBoard: number
  /** Personas sumadas (confirmaron alguna vez), sin el organizador. */
  peopleJoined: number
  matchesFilled: number
  /** Mediana de minutos desde que se creó el partido hasta que se completó. */
  medianMinutesToFill: number | null
  /** Pedidos del tablón, fechados por el día del PEDIDO (no del momento en que se respondió). */
  requestsAccepted: number
  requestsDeclined: number
  /** Pedidos del tablón sin respuesta cuyo partido ya empezó o se canceló. */
  requestsUnanswered: number
  newAccounts: number
  alertsSent: number
  reports: number
  matchesHidden: number
}

type RivalTenantRow = {
  tenantId: string
  name: string
  matchesCreated: number
  matchesOnBoard: number
  peopleJoined: number
  matchesFilled: number
  reports: number
  matchesHidden: number
}

export type RivalMonitor = {
  weeks: RivalWeek[]
  tenants: RivalTenantRow[]
  activeAlertSubscriptions: number
}

type RivalReportView = {
  reason: RivalReportReason
  createdAt: Date
  /** Nombre y la inicial del apellido ("Juan P."), como en el plantel. */
  reporterName: string
  /** `null` = denuncia al partido. */
  reportedName: string | null
  reportedPlayerId: string | null
  reportedHasAvatar: boolean
  /** La DB la calculó: cuenta de 7 días o más con un partido jugado, y no es el organizador. */
  countsForAutohide: boolean
  /** Posterior a la última restauración del partido. */
  open: boolean
}

export type RivalReportedMatch = {
  matchId: string
  tenantName: string
  startsAt: Date
  format: number
  level: string
  canceled: boolean
  hiddenAt: Date | null
  /** Denunciantes distintos del partido que cuentan para ocultarlo. */
  countingReporters: number
  openReports: number
  reports: RivalReportView[]
}

type Rows<T> = T[]

function tsLiteral(d: Date): SQL {
  return sql.raw(`'${d.toISOString()}'::timestamptz`)
}

function weekOf(col: string): SQL {
  return sql.raw(`date_trunc('week', ${col} AT TIME ZONE ${ART})`)
}

async function readWeeks(db: Db, now: Date): Promise<RivalWeek[]> {
  const nowLit = tsLiteral(now)
  const thisWeek = sql`date_trunc('week', ${nowLit} AT TIME ZONE ${sql.raw(ART)})`
  const rows = (await db.execute(sql`
    WITH w AS (
      SELECT generate_series(
        ${thisWeek} - ${sql.raw(`interval '${(WEEKS - 1) * 7} days'`)},
        ${thisWeek},
        interval '7 days'
      ) AS wk
    )
    SELECT to_char(w.wk, 'YYYY-MM-DD') AS week,
      (SELECT count(*) FROM rival_matches m WHERE ${weekOf('m.created_at')} = w.wk)::int AS "matchesCreated",
      (SELECT count(*) FROM rival_matches m
         WHERE ${weekOf('m.created_at')} = w.wk AND m.on_board)::int AS "matchesOnBoard",
      (SELECT count(DISTINCT p.player_id) FROM rival_participants p
         JOIN rival_matches m ON m.id = p.match_id
         WHERE p.confirmed_at IS NOT NULL AND p.role = 'player'
           AND p.player_id <> m.organizer_player_id
           AND ${weekOf('p.confirmed_at')} = w.wk)::int AS "peopleJoined",
      (SELECT count(*) FROM rival_matches m
         WHERE m.filled_at IS NOT NULL AND ${weekOf('m.filled_at')} = w.wk)::int AS "matchesFilled",
      (SELECT round((percentile_cont(0.5) WITHIN GROUP (
                ORDER BY extract(epoch FROM m.filled_at - m.created_at) / 60))::numeric)::float8
         FROM rival_matches m
         WHERE m.filled_at IS NOT NULL AND ${weekOf('m.filled_at')} = w.wk) AS "medianMinutesToFill",
      (SELECT count(*) FROM rival_participants p
         WHERE p.origin = 'board' AND p.confirmed_at IS NOT NULL
           AND ${weekOf('p.created_at')} = w.wk)::int AS "requestsAccepted",
      (SELECT count(*) FROM rival_participants p
         WHERE p.origin = 'board' AND p.status = 'declined'
           AND ${weekOf('p.created_at')} = w.wk)::int AS "requestsDeclined",
      (SELECT count(*) FROM rival_participants p
         JOIN rival_matches m ON m.id = p.match_id
         WHERE p.origin = 'board' AND p.status = 'requested'
           AND (m.starts_at <= ${nowLit} OR m.status = 'canceled')
           AND ${weekOf('p.created_at')} = w.wk)::int AS "requestsUnanswered",
      (SELECT count(*) FROM players pl
         WHERE pl.signup_source = 'rival' AND ${weekOf('pl.created_at')} = w.wk)::int AS "newAccounts",
      (SELECT count(*) FROM rival_alert_sends s WHERE ${weekOf('s.created_at')} = w.wk)::int AS "alertsSent",
      (SELECT count(*) FROM rival_reports r WHERE ${weekOf('r.created_at')} = w.wk)::int AS reports,
      (SELECT count(*) FROM rival_matches m
         WHERE m.hidden_at IS NOT NULL AND ${weekOf('m.hidden_at')} = w.wk)::int AS "matchesHidden"
    FROM w
    ORDER BY w.wk DESC
  `)) as unknown as Rows<RivalWeek>
  return rows
}

async function readTenants(db: Db, now: Date): Promise<RivalTenantRow[]> {
  const since = tsLiteral(new Date(now.getTime() - WEEKS * 7 * DAY_MS))
  const rows = (await db.execute(sql`
    SELECT t.id AS "tenantId", t.name,
      count(m.id)::int AS "matchesCreated",
      count(m.id) FILTER (WHERE m.on_board)::int AS "matchesOnBoard",
      (SELECT count(DISTINCT p.player_id) FROM rival_participants p
        JOIN rival_matches m2 ON m2.id = p.match_id
        WHERE m2.tenant_id = t.id AND m2.created_at >= ${since}
          AND p.confirmed_at IS NOT NULL AND p.role = 'player'
          AND p.player_id <> m2.organizer_player_id)::int AS "peopleJoined",
      count(m.id) FILTER (WHERE m.filled_at IS NOT NULL)::int AS "matchesFilled",
      COALESCE(sum((SELECT count(*) FROM rival_reports r WHERE r.match_id = m.id)), 0)::int AS reports,
      count(m.id) FILTER (WHERE m.hidden_at IS NOT NULL)::int AS "matchesHidden"
    FROM rival_matches m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.created_at >= ${since}
    GROUP BY t.id, t.name
    ORDER BY count(m.id) DESC, t.name
  `)) as unknown as Rows<RivalTenantRow>
  return rows
}

/** Métricas de las últimas 8 semanas (hora argentina), por semana y por complejo. */
export function getRivalMonitor(now: Date = new Date()): Promise<RivalMonitor> {
  return withDisposableWorkerDb(READ_TIMEOUT_MS, async (db) => {
    const [weeks, tenants, subs] = await Promise.all([
      readWeeks(db, now),
      readTenants(db, now),
      db.execute(sql`SELECT count(*)::int AS total FROM rival_alert_subscriptions`),
    ])
    return {
      weeks,
      tenants,
      activeAlertSubscriptions: (subs as unknown as Rows<{ total: number }>)[0]?.total ?? 0,
    }
  })
}

type ReportRow = {
  matchId: string
  tenantName: string
  startsAt: Date
  format: number
  level: string
  canceled: boolean
  hiddenAt: Date | null
  reason: RivalReportReason
  reportCreatedAt: Date
  reporterName: string
  reportedName: string | null
  reportedPlayerId: string | null
  reportedHasAvatar: boolean | null
  countsForAutohide: boolean
  reporterId: string
  isOpen: boolean
}

// Mismo nombre corto que el plantel (`rival_roster`, 099): nombre + inicial del apellido.
function shortNameSql(alias: string): SQL {
  const a = sql.raw(alias)
  return sql`CASE WHEN ${a}.status = 'anonymized' THEN 'Jugador anonimizado'
    ELSE ${a}.first_name || CASE WHEN COALESCE(${a}.last_name, '') <> ''
      THEN ' ' || upper(left(${a}.last_name, 1)) || '.' ELSE '' END END`
}

/**
 * Partidos con denuncias: los ocultos primero, después por cantidad de denuncias abiertas.
 * Se devuelven como máximo los primeros 100 de ese orden.
 * "Abierta" = posterior a la última restauración del partido (sale de `audit_logs`).
 */
export function listRivalReports(): Promise<RivalReportedMatch[]> {
  return withDisposableWorkerDb(READ_TIMEOUT_MS, async (db) => {
    const rows = (await db.execute(sql`
      SELECT m.id AS "matchId", t.name AS "tenantName", m.starts_at AS "startsAt", m.format, m.level,
             (m.status = 'canceled') AS canceled, m.hidden_at AS "hiddenAt",
             r.reason, r.created_at AS "reportCreatedAt", r.counts_for_autohide AS "countsForAutohide",
             r.reporter_player_id AS "reporterId", r.reported_player_id AS "reportedPlayerId",
             ${shortNameSql('rep')} AS "reporterName",
             CASE WHEN r.reported_player_id IS NULL THEN NULL ELSE ${shortNameSql('red')} END AS "reportedName",
             (red.avatar_url IS NOT NULL) AS "reportedHasAvatar",
             (r.created_at > COALESCE((
               SELECT max(a.created_at) FROM audit_logs a
               WHERE a.resource_type = 'rival_match' AND a.resource_id = m.id
                 AND a.action = 'rival.match_restored'
             ), '-infinity'::timestamptz)) AS "isOpen"
      FROM rival_reports r
      JOIN rival_matches m ON m.id = r.match_id
      JOIN tenants t ON t.id = m.tenant_id
      JOIN players rep ON rep.id = r.reporter_player_id
      LEFT JOIN players red ON red.id = r.reported_player_id
      ORDER BY r.created_at DESC
    `)) as unknown as Rows<ReportRow>

    const byMatch = new Map<string, RivalReportedMatch & { counters: Set<string> }>()
    for (const r of rows) {
      let m = byMatch.get(r.matchId)
      if (!m) {
        m = {
          matchId: r.matchId,
          tenantName: r.tenantName,
          startsAt: new Date(r.startsAt),
          format: r.format,
          level: r.level,
          canceled: r.canceled,
          hiddenAt: r.hiddenAt ? new Date(r.hiddenAt) : null,
          countingReporters: 0,
          openReports: 0,
          reports: [],
          counters: new Set(),
        }
        byMatch.set(r.matchId, m)
      }
      if (r.countsForAutohide && r.reportedPlayerId === null) m.counters.add(r.reporterId)
      if (r.isOpen) m.openReports += 1
      m.reports.push({
        reason: r.reason,
        createdAt: new Date(r.reportCreatedAt),
        reporterName: r.reporterName,
        reportedName: r.reportedName,
        reportedPlayerId: r.reportedPlayerId,
        reportedHasAvatar: r.reportedHasAvatar === true,
        countsForAutohide: r.countsForAutohide,
        open: r.isOpen,
      })
    }
    return [...byMatch.values()]
      .map(({ counters, ...m }) => ({ ...m, countingReporters: counters.size }))
      .sort(
        (a, b) =>
          Number(b.hiddenAt !== null) - Number(a.hiddenAt !== null) ||
          b.openReports - a.openReports ||
          b.reports.length - a.reports.length,
      )
      .slice(0, MAX_REPORTED_MATCHES)
  })
}
