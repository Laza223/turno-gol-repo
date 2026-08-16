import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb, getWorkerDb } from '@/shared/db/client'
import { plans, processedWebhooks, tenants, tenantSubscriptions } from '@/shared/db/schema'
import { tenantStatusEnum } from '@/shared/db/schema/enums'
import { ALL_QUEUES } from '@/shared/jobs/dlq'
import { getQueueDepths, type QueueDepthEntry } from '@/shared/jobs/queue-stats'
import { WIZARD_STEPS } from '@/modules/onboarding/onboarding.steps'

/**
 * Métricas globales del panel super-admin (spec 2026-06-12 §5, doc12 §9.5).
 *
 * `tenants`, `plans` y `processed_webhooks` son tablas GLOBALES sin RLS —
 * lectura directa con `getDb()`. `tenant_subscriptions` NO es global (caza-bugs
 * #9): tiene `tenant_id` + RLS+FORCE (ver CLAUDE.md "Tablas aisladas"), así que
 * `getMrrCents` (la única función acá que la toca) necesita el pool de
 * servicio (`getWorkerDb`) para el scan cross-tenant — con `getDb()` el rol
 * restringido `turnogol_app` ve 0 filas fuera de `withTenantContext` y el MRR
 * mostrado siempre da $0.
 */

export type TenantStatus = (typeof tenantStatusEnum.enumValues)[number]

type ExpiringTrial = {
  id: string
  name: string
  slug: string
  trialEndsAt: Date
}

type RecentSignup = {
  id: string
  name: string
  slug: string
  status: TenantStatus
  createdAt: Date
}

type RecentWebhook = {
  id: string
  mpEventId: string
  eventType: string
  processedAt: Date
}

export type DashboardData = {
  /** MRR en centavos ARS: SUM(plans.price_monthly) de las subs activas (doc12 §9.5). */
  mrrCents: number
  /** Conteo de tenants por cada uno de los 8 estados (0 incluido). */
  tenantsByStatus: Record<TenantStatus, number>
  /** Tenants `trialing` cuyo trial vence en ≤7 días, ordenados por vencimiento. */
  expiringTrials: ExpiringTrial[]
  /** Tenants creados en los últimos 7 días (más recientes primero, máx. 10). */
  recentSignups: RecentSignup[]
  /** Total de signups de los últimos 7 días (puede superar los 10 listados). */
  signupsLast7Days: number
  /** Profundidad de cada cola pg-boss (null = no disponible). */
  queues: QueueDepthEntry[]
  /**
   * Últimos 10 webhooks MP registrados en `processed_webhooks`.
   * NOTA: la tabla no tiene columna de estado — un webhook que falla hace
   * rollback de su INSERT (lock de idempotencia) y MP/pg-boss lo reintenta,
   * así que los fallidos nunca persisten acá. Se listan los recientes.
   */
  recentWebhooks: RecentWebhook[]
  /** Embudo del wizard de onboarding, últimos 30 días (Fase 7 del plan de refactor). */
  onboardingFunnel: OnboardingFunnelData
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const FUNNEL_WINDOW_DAYS = 30

export type OnboardingFunnelData = {
  windowDays: number
  /** `onboarding.started`: vistas del paso 1 SIN tenant todavía (no hay a qué tenant atribuirlas). */
  startedViews: number
  /** Tenants distintos que completaron cada paso — el embudo real (1→2→3→4). */
  stepCompleted: { step: number; stepName: string; tenants: number }[]
  /** Tenants distintos que cerraron el wizard (`onboarding.completed`). */
  completedTenants: number
  /** De los que cerraron, cuántos cargaron su turno en el paso 4 en vez de saltearlo. */
  firstBookingInWizard: number
  linkShared: number
  mpConnected: number
  /** El aha moment real: primeras reservas ONLINE (jugador) recibidas en la ventana. */
  activationEvents: number
  /** Mediana de días entre `onboarding.completed` y la primera reserva online, cuando se pudo calcular. */
  medianDaysToActivation: number | null
}

/**
 * `analytics_events` es append-only y su policy de SELECT es estricta (RLS
 * por tenant) — un scan cross-tenant como este necesita el pool de servicio,
 * igual que `getMrrCents` de acá arriba.
 */
async function getOnboardingFunnel(): Promise<OnboardingFunnelData> {
  const db = getWorkerDb()
  // Ventana fija de 30 días: interpolada como INTERVAL literal, no como
  // parámetro — Postgres no castea un `$1::text` a `interval` en esa posición.
  const windowInterval = sql.raw(`interval '${FUNNEL_WINDOW_DAYS} days'`)

  const [stepRows, topRows, activationRows] = await Promise.all([
    db.execute(sql`
      SELECT (data->>'step')::int AS step, COUNT(DISTINCT tenant_id)::int AS tenants
      FROM analytics_events
      WHERE category = 'onboarding' AND event = 'onboarding.step.completed'
        AND occurred_at >= now() - ${windowInterval}
      GROUP BY step
    `),
    db.execute(sql`
      SELECT event, COUNT(*)::int AS total, COUNT(DISTINCT tenant_id)::int AS tenants
      FROM analytics_events
      WHERE category = 'onboarding'
        AND event IN ('onboarding.started', 'onboarding.completed', 'onboarding.first_booking.created',
                       'onboarding.link.shared', 'onboarding.mp.connected')
        AND occurred_at >= now() - ${windowInterval}
      GROUP BY event
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total,
             PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY (data->>'daysSinceOnboarding')::numeric
             ) AS median_days
      FROM analytics_events
      WHERE category = 'activation' AND event = 'activation.first_online_booking'
        AND occurred_at >= now() - ${windowInterval}
    `),
  ])

  const stepTenants = new Map<number, number>(
    (stepRows as unknown as Array<{ step: number | null; tenants: number }>)
      .filter((r) => r.step !== null)
      .map((r) => [r.step as number, r.tenants]),
  )
  const byEvent = new Map<string, { total: number; tenants: number }>(
    (topRows as unknown as Array<{ event: string; total: number; tenants: number }>).map((r) => [
      r.event,
      { total: r.total, tenants: r.tenants },
    ]),
  )
  const activation = (
    activationRows as unknown as Array<{ total: number; median_days: string | null }>
  )[0]

  return {
    windowDays: FUNNEL_WINDOW_DAYS,
    startedViews: byEvent.get('onboarding.started')?.total ?? 0,
    stepCompleted: WIZARD_STEPS.map((s) => ({
      step: s.n,
      stepName: s.label,
      tenants: stepTenants.get(s.n) ?? 0,
    })),
    completedTenants: byEvent.get('onboarding.completed')?.tenants ?? 0,
    firstBookingInWizard: byEvent.get('onboarding.first_booking.created')?.tenants ?? 0,
    linkShared: byEvent.get('onboarding.link.shared')?.tenants ?? 0,
    mpConnected: byEvent.get('onboarding.mp.connected')?.tenants ?? 0,
    activationEvents: activation?.total ?? 0,
    medianDaysToActivation: activation?.median_days != null ? Number(activation.median_days) : null,
  }
}

async function getMrrCents(): Promise<number> {
  const db = getWorkerDb()
  const rows = await db
    .select({
      // SUM(integer) llega como bigint (string) — coalesce + cast a number.
      mrr: sql<string>`coalesce(sum(${plans.priceMonthly}), 0)`,
    })
    .from(tenantSubscriptions)
    .innerJoin(plans, eq(plans.id, tenantSubscriptions.planId))
    .where(eq(tenantSubscriptions.status, 'active'))
  return Number(rows[0]?.mrr ?? 0)
}

async function getTenantsByStatus(): Promise<Record<TenantStatus, number>> {
  const db = getDb()
  const rows = await db
    .select({ status: tenants.status, total: count() })
    .from(tenants)
    .groupBy(tenants.status)

  const byStatus = Object.fromEntries(
    tenantStatusEnum.enumValues.map((status) => [status, 0]),
  ) as Record<TenantStatus, number>
  for (const row of rows) {
    byStatus[row.status] = row.total
  }
  return byStatus
}

async function getExpiringTrials(now: Date): Promise<ExpiringTrial[]> {
  const db = getDb()
  const in7Days = new Date(now.getTime() + SEVEN_DAYS_MS)
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      trialEndsAt: tenants.trialEndsAt,
    })
    .from(tenants)
    .where(
      and(
        eq(tenants.status, 'trialing'),
        gte(tenants.trialEndsAt, now),
        lte(tenants.trialEndsAt, in7Days),
      ),
    )
    .orderBy(asc(tenants.trialEndsAt))
  // gte/lte ya filtran NULL, pero el tipo de la columna sigue siendo nullable.
  return rows.filter((r): r is ExpiringTrial => r.trialEndsAt !== null)
}

async function getRecentSignups(now: Date): Promise<{ list: RecentSignup[]; total: number }> {
  const db = getDb()
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS)
  const [list, totals] = await Promise.all([
    db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(gte(tenants.createdAt, sevenDaysAgo))
      .orderBy(desc(tenants.createdAt))
      .limit(10),
    db.select({ total: count() }).from(tenants).where(gte(tenants.createdAt, sevenDaysAgo)),
  ])
  return { list, total: totals[0]?.total ?? 0 }
}

async function getRecentWebhooks(): Promise<RecentWebhook[]> {
  const db = getDb()
  return db
    .select({
      id: processedWebhooks.id,
      mpEventId: processedWebhooks.mpEventId,
      eventType: processedWebhooks.eventType,
      processedAt: processedWebhooks.processedAt,
    })
    .from(processedWebhooks)
    .orderBy(desc(processedWebhooks.processedAt))
    .limit(10)
}

/**
 * Si pg-boss no puede ni arrancar (DB de colas caída), el dashboard degrada
 * a "no disponible" en vez de romper el render completo.
 */
async function getQueueDepthsSafe(): Promise<QueueDepthEntry[]> {
  try {
    return await getQueueDepths()
  } catch {
    return ALL_QUEUES.map((queue) => ({
      queue,
      depth: null,
      error: 'unavailable' as const,
    }))
  }
}

/** Carga todas las métricas del dashboard global en paralelo. */
export async function getDashboardData(): Promise<DashboardData> {
  const now = new Date()
  const [
    mrrCents,
    tenantsByStatus,
    expiringTrials,
    signups,
    queues,
    recentWebhooks,
    onboardingFunnel,
  ] = await Promise.all([
    getMrrCents(),
    getTenantsByStatus(),
    getExpiringTrials(now),
    getRecentSignups(now),
    getQueueDepthsSafe(),
    getRecentWebhooks(),
    getOnboardingFunnel(),
  ])

  return {
    mrrCents,
    tenantsByStatus,
    expiringTrials,
    recentSignups: signups.list,
    signupsLast7Days: signups.total,
    queues,
    recentWebhooks,
    onboardingFunnel,
  }
}
