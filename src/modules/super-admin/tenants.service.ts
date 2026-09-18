import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { getDb, getWorkerDb, withTenantContext } from '@/shared/db/client'
import {
  auditLogs,
  bookings,
  courts,
  plans,
  tenants,
  tenantSubscriptions,
} from '@/shared/db/schema'
import { listStaffRoster } from '@/modules/staff/staff.service'
import { annualMonthlyEquivalent, monthlyListAmount } from '@/modules/billing/pricing'
import { TENANT_STATUSES, isTenantStatus } from '@/modules/billing/billing.types'
import type {
  BillingCycle,
  SubscriptionStatus,
  TenantStatus,
} from '@/modules/billing/billing.types'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

/**
 * Lecturas cross-tenant del panel SuperAdmin (spec §4 y §5).
 *
 * - `tenants` y `plans` son tablas GLOBALES (sin RLS): se leen directo con
 *   `getDb()`.
 * - `tenant_subscriptions` NO es global (caza-bugs #10): tiene `tenant_id` +
 *   RLS+FORCE (ver CLAUDE.md "Tablas aisladas"). El super admin la lee
 *   cross-tenant a propósito (spec: "puede ver todos los tenants"), así que
 *   usa `getWorkerDb()` (pool de servicio) en vez de `withTenantContext` —
 *   con `getDb()` el rol restringido `turnogol_app` ve 0 filas fuera de
 *   `withTenantContext`, dejando plan/estado de suscripción NULL para todos.
 * - `courts`, `tenant_staff_members`, `audit_logs` y `bookings` son tablas RLS:
 *   TODA lectura sobre un tenant específico va dentro de
 *   `withTenantContext(tenantId)` para que la defensa RLS normal aplique.
 */

/** Re-exportados para no romper a los consumidores existentes (page.tsx). Definición real: billing.types.ts. */
export { TENANT_STATUSES, isTenantStatus }

// ─── Lista ───────────────────────────────────────────────────────────────────

export type TenantListFilters = {
  q?: string
  status?: TenantStatus
  page: number
  pageSize: number
}

type TenantListRow = {
  id: string
  name: string
  slug: string
  email: string
  status: TenantStatus
  trialEndsAt: Date | null
  createdAt: Date
  /**
   * Canchas por las que se le factura (migr. 090). `null` = el complejo no
   * tiene fila en `tenant_subscriptions` todavía. Reemplaza a la columna
   * "Plan": con una sola fila activa en `plans`, el nombre del plan es el
   * mismo para todos y no distingue nada.
   */
  billedCourts: number | null
  billingCycle: BillingCycle | null
  subscriptionStatus: SubscriptionStatus | null
  /** Centavos ARS/mes. 0 si la suscripción no está activa (no genera MRR). */
  mrrCents: number
}

export type TenantList = {
  rows: TenantListRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * MRR mensual equivalente de UNA suscripción, en centavos ARS.
 *
 * Este es el cálculo que MIENTE si alguien se olvida de tocarlo. Antes sumaba
 * `plans.price_monthly`; desde la migr. 091 `plans` tiene una sola fila activa,
 * así que esa versión no rompe: devuelve "precio de una cancha × cantidad de
 * complejos" y el panel muestra un número plausible y falso. El monto real es
 * función de `billed_courts` (decisión 2026-09-17).
 *
 * Usa las mismas funciones puras que el cobro (`@/modules/billing/pricing`)
 * para que el panel y lo que se le manda a MercadoPago no puedan divergir.
 * El ciclo anual aporta su equivalente MENSUAL, no el cobro del año: el MRR es
 * una tasa mensual.
 */
function monthlyEquivalentCents(
  cycle: BillingCycle | null,
  billedCourts: number | null,
  plan: {
    priceFirstCourtCents: number | null
    priceExtraCourtCents: number | null
    annualDiscountBps: number | null
  },
): number {
  // Sin fila de suscripción, o con un plan legacy sin parámetros de precio
  // lineal, no hay monto que declarar. Inventarlo sería peor que mostrar 0.
  if (
    billedCourts === null ||
    billedCourts < 1 ||
    plan.priceFirstCourtCents === null ||
    plan.priceExtraCourtCents === null ||
    plan.annualDiscountBps === null
  ) {
    return 0
  }
  const params = {
    priceFirstCourtCents: plan.priceFirstCourtCents,
    priceExtraCourtCents: plan.priceExtraCourtCents,
    annualDiscountBps: plan.annualDiscountBps,
  }
  return cycle === 'annual'
    ? annualMonthlyEquivalent(billedCourts, params)
    : monthlyListAmount(billedCourts, params)
}

export async function listTenants(filters: TenantListFilters): Promise<TenantList> {
  const db = getWorkerDb()
  const conditions: SQL[] = []
  const q = filters.q?.trim()
  if (q) {
    const needle = `%${q}%`
    const cond = or(
      ilike(tenants.name, needle),
      ilike(tenants.slug, needle),
      ilike(tenants.email, needle),
    )
    if (cond) conditions.push(cond)
  }
  if (filters.status) conditions.push(eq(tenants.status, filters.status))
  const where = conditions.length ? and(...conditions) : undefined

  const offset = (filters.page - 1) * filters.pageSize

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      email: tenants.email,
      status: tenants.status,
      trialEndsAt: tenants.trialEndsAt,
      createdAt: tenants.createdAt,
      billedCourts: tenantSubscriptions.billedCourts,
      priceFirstCourtCents: plans.priceFirstCourtCents,
      priceExtraCourtCents: plans.priceExtraCourtCents,
      annualDiscountBps: plans.annualDiscountBps,
      billingCycle: tenantSubscriptions.billingCycle,
      subscriptionStatus: tenantSubscriptions.status,
    })
    .from(tenants)
    .leftJoin(tenantSubscriptions, eq(tenantSubscriptions.tenantId, tenants.id))
    .leftJoin(plans, eq(plans.id, tenantSubscriptions.planId))
    .where(where)
    .orderBy(desc(tenants.createdAt))
    .limit(filters.pageSize)
    .offset(offset)

  // El join es 1:1 (tenant_subscriptions.tenant_id es UNIQUE) — el count no se infla.
  const totalRows = await db
    .select({ total: count() })
    .from(tenants)
    .leftJoin(tenantSubscriptions, eq(tenantSubscriptions.tenantId, tenants.id))
    .leftJoin(plans, eq(plans.id, tenantSubscriptions.planId))
    .where(where)

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      email: r.email,
      status: r.status,
      trialEndsAt: r.trialEndsAt,
      createdAt: r.createdAt,
      billedCourts: r.billedCourts,
      billingCycle: r.billingCycle,
      subscriptionStatus: r.subscriptionStatus,
      mrrCents:
        r.subscriptionStatus === 'active'
          ? monthlyEquivalentCents(r.billingCycle, r.billedCourts, r)
          : 0,
    })),
    total: totalRows[0]?.total ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

// El `listActivePlans()` + `PlanSummary` que vivían acá se eliminaron: eran un
// duplicado del par canónico de `@/modules/billing` (`listActivePlans(tx)` +
// `PlanSummary` de billing.types), y con una sola fila activa en `plans` el
// panel ya no necesita listar nada. Los parámetros de precio que la UI de
// soporte precisa vienen JOINeados en `getTenantDetail`, sin segunda query.

// ─── Resumen mínimo (confirmaciones server-side de las actions) ──────────────

export type TenantSummary = { id: string; name: string; slug: string; status: TenantStatus }

export async function getTenantSummary(tenantId: string): Promise<TenantSummary | null> {
  const db = getDb()
  const rows = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return rows[0] ?? null
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

export type TenantDetail = {
  tenant: {
    id: string
    slug: string
    name: string
    description: string | null
    address: string
    city: string
    province: string
    phone: string
    email: string
    status: TenantStatus
    marketplaceVisible: boolean
    trialEndsAt: Date | null
    scheduledDeletionAt: Date | null
    mpConnectedAt: Date | null
    createdAt: Date
    settings: TenantSettings
  }
  subscription: {
    status: SubscriptionStatus
    planId: string
    /** Canchas por las que se le factura hoy (migr. 090). */
    billedCourts: number
    /** A cuántas canchas pasa el cobro en `pendingChangeAt`. `null` = sin cambio. */
    pendingBilledCourts: number | null
    /**
     * Parámetros de precio del plan al que apunta la suscripción. Llegan
     * JOINeados para que la UI arme el desglose con las mismas funciones que
     * el cobro. `null` solo si la fila es una banda legacy (migr. 091 repunta
     * todas las suscripciones a la fila lineal, así que no debería pasar).
     */
    priceFirstCourtCents: number | null
    priceExtraCourtCents: number | null
    annualDiscountBps: number | null
    billingCycle: BillingCycle
    currentPeriodStart: Date
    currentPeriodEnd: Date
    mpSubscriptionId: string | null
    pendingChangeAt: Date | null
    canceledAt: Date | null
    cancellationReason: string | null
    scheduledDeletionAt: Date | null
    dunningStartedAt: Date | null
    lastPaymentAt: Date | null
    lastPaymentFailedAt: Date | null
  } | null
  courts: Array<{
    id: string
    name: string
    status: 'online' | 'offline'
    surfaceType: string
    format: number
    capacity: number
  }>
  staff: Array<{
    id: string
    email: string
    firstName: string
    lastName: string
    role: 'admin' | 'manager'
    isActive: boolean
    lastLoginAt: Date | null
  }>
}

export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  const db = getDb()

  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      description: tenants.description,
      address: tenants.address,
      city: tenants.city,
      province: tenants.province,
      phone: tenants.phone,
      email: tenants.email,
      status: tenants.status,
      marketplaceVisible: tenants.marketplaceVisible,
      trialEndsAt: tenants.trialEndsAt,
      scheduledDeletionAt: tenants.scheduledDeletionAt,
      mpConnectedAt: tenants.mpConnectedAt,
      createdAt: tenants.createdAt,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const t = tenantRows[0]
  if (!t) return null

  // tenant_subscriptions tiene RLS+FORCE (caza-bugs #10) — pool de servicio,
  // no el `db` de arriba (restringido, sin contexto de tenant seteado acá).
  const workerDb = getWorkerDb()
  const subRows = await workerDb
    .select({
      status: tenantSubscriptions.status,
      planId: tenantSubscriptions.planId,
      billedCourts: tenantSubscriptions.billedCourts,
      pendingBilledCourts: tenantSubscriptions.pendingBilledCourts,
      priceFirstCourtCents: plans.priceFirstCourtCents,
      priceExtraCourtCents: plans.priceExtraCourtCents,
      annualDiscountBps: plans.annualDiscountBps,
      billingCycle: tenantSubscriptions.billingCycle,
      currentPeriodStart: tenantSubscriptions.currentPeriodStart,
      currentPeriodEnd: tenantSubscriptions.currentPeriodEnd,
      mpSubscriptionId: tenantSubscriptions.mpSubscriptionId,
      pendingChangeAt: tenantSubscriptions.pendingChangeAt,
      canceledAt: tenantSubscriptions.canceledAt,
      cancellationReason: tenantSubscriptions.cancellationReason,
      scheduledDeletionAt: tenantSubscriptions.scheduledDeletionAt,
      dunningStartedAt: tenantSubscriptions.dunningStartedAt,
      lastPaymentAt: tenantSubscriptions.lastPaymentAt,
      lastPaymentFailedAt: tenantSubscriptions.lastPaymentFailedAt,
    })
    .from(tenantSubscriptions)
    .leftJoin(plans, eq(plans.id, tenantSubscriptions.planId))
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1)

  // courts es tabla RLS → lectura dentro del contexto del tenant (spec §4).
  // staff_users/tenant_staff_members se leen vía listStaffRoster: es global
  // y su policy de SELECT (006_rls_policies.sql, staff_see_same_tenant_staff)
  // solo expone miembros is_active=true, así que un join bajo el pool de
  // tenant escondería a los miembros desactivados del detalle de SuperAdmin
  // (mismo bug que tenía (admin)/staff/page.tsx). tenantId ya fue validado
  // arriba contra la tabla `tenants` — no es input crudo del cliente.
  const [courtRows, staffRoster] = await Promise.all([
    withTenantContext(tenantId, (tx) =>
      tx
        .select({
          id: courts.id,
          name: courts.name,
          status: courts.status,
          surfaceType: courts.surfaceType,
          format: courts.format,
          capacity: courts.capacity,
        })
        .from(courts)
        .where(eq(courts.tenantId, tenantId))
        .orderBy(courts.name),
    ),
    listStaffRoster(tenantId),
  ])
  const staffRows = staffRoster.map((m) => ({
    id: m.staffUserId,
    email: m.email,
    firstName: m.firstName,
    lastName: m.lastName,
    role: m.role,
    isActive: m.isActive,
    lastLoginAt: m.lastLoginAt,
  }))

  return {
    tenant: { ...t, settings: t.settings as TenantSettings },
    subscription: subRows[0] ?? null,
    courts: courtRows,
    staff: staffRows,
  }
}

// ─── Actividad (audit trail + últimos bookings) ──────────────────────────────

type AuditLogRow = {
  id: string
  action: string
  actorType: 'staff' | 'player' | 'system'
  actorId: string
  resourceType: string
  resourceId: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

type RecentBookingRow = {
  id: string
  date: Date
  timeStart: string
  timeEnd: string
  status: string
  courtName: string | null
  priceSnapshot: number
  createdAt: Date
}

export type TenantActivity = {
  logs: AuditLogRow[]
  totalLogs: number
  page: number
  pageSize: number
  recentBookings: RecentBookingRow[]
}

/**
 * Gotcha conocido del repo (ver tests/integration/mp-webhook.test.ts:246): las
 * filas escritas vía drizzle jsonb quedan double-encoded (string scalar dentro
 * del jsonb), así que metadata puede volver como string. Se normaliza acá.
 */
function parseAuditMetadata(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return { raw: value }
    }
  }
  return value as Record<string, unknown>
}

export async function getTenantActivity(
  tenantId: string,
  opts: { page: number; pageSize: number },
): Promise<TenantActivity> {
  // audit_logs y bookings son tablas RLS → todo dentro de withTenantContext (spec §4).
  return withTenantContext(tenantId, async (tx) => {
    const offset = (opts.page - 1) * opts.pageSize

    const logs = await tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorType: auditLogs.actorType,
        actorId: auditLogs.actorId,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.pageSize)
      .offset(offset)

    const totalRows = await tx
      .select({ total: count() })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))

    const recentBookings = await tx
      .select({
        id: bookings.id,
        date: bookings.date,
        timeStart: bookings.timeStart,
        timeEnd: bookings.timeEnd,
        status: bookings.status,
        courtName: courts.name,
        priceSnapshot: bookings.priceSnapshot,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .leftJoin(courts, eq(courts.id, bookings.courtId))
      .where(eq(bookings.tenantId, tenantId))
      .orderBy(desc(bookings.createdAt))
      .limit(10)

    return {
      logs: logs.map((l) => ({
        ...l,
        metadata: parseAuditMetadata(l.metadata),
      })),
      totalLogs: totalRows[0]?.total ?? 0,
      page: opts.page,
      pageSize: opts.pageSize,
      recentBookings,
    }
  })
}
