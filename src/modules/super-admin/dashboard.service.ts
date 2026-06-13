import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import {
  plans,
  processedWebhooks,
  tenants,
  tenantSubscriptions,
} from '@/shared/db/schema'
import { tenantStatusEnum } from '@/shared/db/schema/enums'
import { ALL_QUEUES } from '@/shared/jobs/dlq'
import { getQueueDepths, type QueueDepthEntry } from '@/shared/jobs/queue-stats'

/**
 * Métricas globales del panel super-admin (spec 2026-06-12 §5, doc12 §9.5).
 *
 * Todas las queries van contra tablas GLOBALES sin RLS (`tenants`, `plans`,
 * `tenant_subscriptions`, `processed_webhooks`) — lectura directa con
 * `getDb()`, igual que el resto del código que las consulta. No se toca
 * ninguna tabla RLS-aislada acá.
 */

export type TenantStatus = (typeof tenantStatusEnum.enumValues)[number]

export type ExpiringTrial = {
  id: string
  name: string
  slug: string
  trialEndsAt: Date
}

export type RecentSignup = {
  id: string
  name: string
  slug: string
  status: TenantStatus
  createdAt: Date
}

export type RecentWebhook = {
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
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

async function getMrrCents(): Promise<number> {
  const db = getDb()
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

async function getRecentSignups(
  now: Date,
): Promise<{ list: RecentSignup[]; total: number }> {
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
    db
      .select({ total: count() })
      .from(tenants)
      .where(gte(tenants.createdAt, sevenDaysAgo)),
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
  const [mrrCents, tenantsByStatus, expiringTrials, signups, queues, recentWebhooks] =
    await Promise.all([
      getMrrCents(),
      getTenantsByStatus(),
      getExpiringTrials(now),
      getRecentSignups(now),
      getQueueDepthsSafe(),
      getRecentWebhooks(),
    ])

  return {
    mrrCents,
    tenantsByStatus,
    expiringTrials,
    recentSignups: signups.list,
    signupsLast7Days: signups.total,
    queues,
    recentWebhooks,
  }
}
