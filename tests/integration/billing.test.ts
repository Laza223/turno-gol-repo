import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import {
  cancel as billingCancel,
  changeBilledCourts,
  getBillingPayerEmail,
  setBillingPayerEmail,
  getSubscriptionState,
  reactivate as billingReactivate,
  subscribe as billingSubscribe,
} from '@/modules/billing/billing.service'
import { onPaymentApproved, onPaymentRejected } from '@/modules/billing/dunning.service'
import {
  CANCELED_BLOCKED_DELETION_DAYS,
  CHURNED_DELETION_DAYS,
  transitionTrialingToActive,
  transitionToCanceled,
} from '@/modules/billing/lifecycle.service'
import {
  DowngradeBlockedError,
  InvalidTransitionError,
  ReactivateNotAllowedError,
} from '@/modules/billing/billing.errors'
import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'
import {
  asApp,
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import type { Sql } from 'postgres'

/**
 * Montos de referencia del precio LINEAL POR CANCHA
 * (`docs/decisions/2026-09-17-precio-por-cancha.md` P1/P2): $47.000 la primera
 * cancha + $30.000 por cada extra, anual 10% off.
 *
 * Escritos a mano, no derivados de `pricing.ts`: si el test recalculara con la
 * misma función que ejercita, un cambio de parámetros lo dejaría verde igual.
 * El candado del catálogo contra la tabla real vive en `pricing-sync.test.ts`;
 * acá los números están para que se vea QUÉ monto viaja a MercadoPago en cada
 * camino.
 */
const MONTHLY_3 = 10_700_000
const MONTHLY_5 = 16_700_000
/** Anual = equivalente mensual con 10% off, × 12 (el preapproval anual cobra 1 vez). */
const ANNUAL_1 = 50_760_000 // $42.300 × 12
const ANNUAL_3 = 115_560_000 // $96.300 × 12
const ANNUAL_5 = 180_360_000 // $150.300 × 12

/**
 * Desde la migr. 091 `plans` tiene UNA sola fila activa. El fixture dejó de ser
 * "qué plan elijo" (antes: `PlansById { predio, complejo, estadio }`) y pasó a
 * ser el id de la única fila: lo que el complejo elige ahora es la CANTIDAD DE
 * CANCHAS, no un plan.
 */
let planId: string

async function loadActivePlanId(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
  `
  const id = rows[0]?.id
  if (!id) throw new Error('no hay plan activo — ¿faltan aplicar las migraciones 090/091?')
  return id
}

async function seedSubscription(
  sql: Sql,
  tenantId: string,
  status: string,
  opts: {
    /** Canchas por las que se cobra hoy (`tenant_subscriptions.billed_courts`). */
    billedCourts?: number
    billingCycle?: 'monthly' | 'annual'
    currentPeriodStart?: Date
    currentPeriodEnd?: Date
    mpSubscriptionId?: string | null
    dunningStartedAt?: Date | null
    canceledAt?: Date | null
    scheduledDeletionAt?: Date | null
  } = {},
): Promise<void> {
  const start = (opts.currentPeriodStart ?? new Date('2027-04-01T00:00:00Z')).toISOString()
  const end = (opts.currentPeriodEnd ?? new Date('2027-05-01T00:00:00Z')).toISOString()
  const dunningStartedAt = opts.dunningStartedAt ? opts.dunningStartedAt.toISOString() : null
  const canceledAt = opts.canceledAt ? opts.canceledAt.toISOString() : null
  const scheduledDeletionAt = opts.scheduledDeletionAt
    ? opts.scheduledDeletionAt.toISOString()
    : null

  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, billed_courts, status,
      current_period_start, current_period_end,
      mp_subscription_id, dunning_started_at,
      canceled_at, scheduled_deletion_at
    ) VALUES (
      ${tenantId}, ${planId}, ${opts.billingCycle ?? 'monthly'}::billing_cycle,
      ${opts.billedCourts ?? 1},
      ${status}::subscription_status,
      ${start}::timestamptz, ${end}::timestamptz,
      ${opts.mpSubscriptionId ?? null},
      ${dunningStartedAt}::timestamptz,
      ${canceledAt}::timestamptz,
      ${scheduledDeletionAt}::timestamptz
    )
  `
  await sql`
    UPDATE tenants
    SET status = ${status}::tenant_status,
        scheduled_deletion_at = ${scheduledDeletionAt}::timestamptz
    WHERE id = ${tenantId}
  `
}

async function seedActiveTenant(
  sql: Sql,
  opts: {
    billedCourts?: number
    billingCycle?: 'monthly' | 'annual'
    currentPeriodStart?: Date
    currentPeriodEnd?: Date
    mpSubscriptionId?: string
  } = {},
): Promise<{ tenantId: string; staffId: string }> {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  await seedSubscription(sql, tenant.id, 'active', {
    ...opts,
    mpSubscriptionId: opts.mpSubscriptionId ?? `mp-preapp-test-${tenant.id}`,
  })
  return { tenantId: tenant.id, staffId: staff.id }
}

/** N canchas ONLINE — lo que mide el piso de facturación (`countOnlineCourts`). */
async function seedOnlineCourts(sql: Sql, tenantId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await sql`
      INSERT INTO courts (tenant_id, name, capacity, status)
      VALUES (${tenantId}, ${`Cancha ${i + 1}`}, 10, 'online')
    `
  }
}

async function fetchSubStatus(tenantId: string): Promise<string> {
  const rows = await asApp(
    tenantId,
    (tx) =>
      tx<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `,
  )
  return rows[0]!.status
}

type BillingRow = {
  billed_courts: number
  pending_billed_courts: number | null
  pending_change_at: Date | string | null
}

async function fetchBilling(tenantId: string): Promise<BillingRow> {
  const rows = await asApp(
    tenantId,
    (tx) =>
      tx<BillingRow[]>`
      SELECT billed_courts, pending_billed_courts, pending_change_at
      FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `,
  )
  return rows[0]!
}

// tenants es tabla GLOBAL sin RLS (no tiene tenant_id que aislar): se queda
// en el pool de siempre, no hay contexto de tenant que setear acá.
async function fetchTenantStatus(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM tenants WHERE id = ${tenantId}
  `
  return rows[0]!.status
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  planId = await loadActivePlanId(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

let mockGateway: MockGateway

beforeEach(() => {
  mockGateway = new MockGateway()
  setBillingGateway(mockGateway)
})

afterEach(async () => {
  setBillingGateway(null)
  const sql = getSql()
  await sql`TRUNCATE TABLE notifications, audit_logs, tenant_subscriptions, tenant_staff_members, courts, tenants, staff_users, processed_webhooks RESTART IDENTITY CASCADE`
})

// ─── Lifecycle FSM (legal + illegal transitions) ────────────────────────────

describe('lifecycle FSM', () => {
  it('trialing → active (legal)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await seedSubscription(sql, tenant.id, 'trialing')

    await withTenantContext(tenant.id, async (tx) => {
      await transitionTrialingToActive(
        tenant.id,
        new Date('2027-04-01T00:00:00Z'),
        new Date('2027-05-01T00:00:00Z'),
        tx,
      )
    })

    expect(await fetchSubStatus(tenant.id)).toBe('active')
    expect(await fetchTenantStatus(sql, tenant.id)).toBe('active')
  })

  // NOTE (audit): el test anterior se llamaba "trialing → suspended (illegal)"
  // pero NO ejercitaba esa transición: hacía doble-cancel. Nombre mentiroso +
  // sin verificar estado final. Reescrito en dos tests honestos abajo.
  it('rechaza doble cancelación: la 2da transitionToCanceled lanza InvalidTransitionError y el estado queda en canceled', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await seedSubscription(sql, tenant.id, 'trialing')

    // 1ra cancelación (legal: trialing → canceled), commiteada en su propia tx.
    await withTenantContext(tenant.id, async (tx) => {
      await transitionToCanceled(tenant.id, 'primera', tx)
    })
    expect(await fetchSubStatus(tenant.id)).toBe('canceled')

    // 2da cancelación sobre un sub ya canceled: 0 filas afectadas → error.
    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await transitionToCanceled(tenant.id, 'segunda', tx)
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    // Estado y razón quedan intactos de la PRIMERA cancelación (no sobrescritos).
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ status: string; cancellation_reason: string }[]>`
        SELECT status, cancellation_reason FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
    expect(rows[0]!.status).toBe('canceled')
    expect(rows[0]!.cancellation_reason).toBe('primera')
  })

  it('rechaza transición ilegal: activar un sub que no está en trialing lanza InvalidTransitionError', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql) // ya active, no trialing

    await expect(
      withTenantContext(tenantId, async (tx) => {
        await transitionTrialingToActive(
          tenantId,
          new Date('2027-04-01T00:00:00Z'),
          new Date('2027-05-01T00:00:00Z'),
          tx,
        )
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    // El sub sigue active, sin tocar (el guard de la FSM protege el estado).
    expect(await fetchSubStatus(tenantId)).toBe('active')
  })

  it('canceled → blocked sweep when period_end < NOW', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql)

    // Cancel
    await withTenantContext(tenantId, async (tx) => {
      await transitionToCanceled(tenantId, 'too expensive', tx)
    })
    expect(await fetchTenantStatus(sql, tenantId)).toBe('canceled')

    // Force period_end in the past so sweep fires.
    await sql`
      UPDATE tenant_subscriptions SET current_period_end = NOW() - INTERVAL '1 day'
      WHERE tenant_id = ${tenantId}
    `

    await runDunningSweep()

    expect(await fetchTenantStatus(sql, tenantId)).toBe('blocked')
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ scheduled_deletion_at: Date | null }[]>`
        SELECT scheduled_deletion_at FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(rows[0]!.scheduled_deletion_at).not.toBeNull()
  })
})

// ─── Test A: 3 webhook payment.rejected → blocked → churned ────────────────

describe('Test A — dunning escalation drives blocked → churned', () => {
  it('rejected → past_due; sweep at d7 → suspended; d14 → blocked; d90 → churned', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql)

    // Rejected webhook
    await withTenantContext(tenantId, async (tx) => {
      await onPaymentRejected(
        tenantId,
        'mp-evt-1',
        'subscription_authorized_payment',
        { test: 1 },
        new Date(),
        tx,
      )
    })
    expect(await fetchTenantStatus(sql, tenantId)).toBe('past_due')

    // Force dunning_started_at to 7d ago + sweep → suspended
    await sql`
      UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '7 days'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()
    expect(await fetchTenantStatus(sql, tenantId)).toBe('suspended')

    // Force 14d + sweep → blocked
    await sql`
      UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '14 days'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()
    expect(await fetchTenantStatus(sql, tenantId)).toBe('blocked')

    // Force 90d + sweep → churned, scheduled_deletion_at ≈ NOW + CHURNED_DELETION_DAYS
    await sql`
      UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '90 days'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()
    expect(await fetchTenantStatus(sql, tenantId)).toBe('churned')
    // tenants es tabla GLOBAL sin RLS: se queda en el pool de siempre.
    const rows = await sql<{ scheduled_deletion_at: Date | string | null }[]>`
      SELECT scheduled_deletion_at FROM tenants WHERE id = ${tenantId}
    `
    const delAtRaw = rows[0]!.scheduled_deletion_at
    expect(delAtRaw).not.toBeNull()
    const delAt = new Date(delAtRaw as unknown as string)
    const inDays = (delAt.getTime() - Date.now()) / 86_400_000
    expect(inDays).toBeGreaterThan(CHURNED_DELETION_DAYS - 0.5)
    expect(inDays).toBeLessThan(CHURNED_DELETION_DAYS + 0.5)
  })
})

// ─── Test B — cambiar la cantidad de canchas facturadas ────────────────────
//
// Reemplaza al viejo "Test B — upgrade Predio → Complejo proration". El
// proraeo YA NO EXISTE: con precio por cancha, sumar o sacar una cancha nunca
// se cobra en el medio del período (decisión 2026-09-17, P4). Lo que hay que
// probar ahora es lo contrario de lo que probaba aquel test: que NO se cobra
// nada, y que el cambio queda agendado para el cierre del período.

describe('Test B — changeBilledCourts con la suscripción ACTIVA: se agenda, no se cobra', () => {
  it('agenda pending_billed_courts al fin del período, sin tocar MP ni cobrar un peso', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, {
      billedCourts: 3,
      currentPeriodStart: new Date('2027-04-01T00:00:00Z'),
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    const result = await withTenantContext(tenantId, (tx) =>
      changeBilledCourts(tenantId, 5, mockGateway, tx),
    )

    expect(result.applied).toBe(false)
    expect(result.previousBilledCourts).toBe(3)
    expect(result.billedCourts).toBe(5)
    expect(result.appliesAt?.toISOString()).toBe('2027-05-01T00:00:00.000Z')

    // Cero plata en el medio del período: ni una preferencia de cobro único,
    // ni un cambio de monto en el preapproval. Este es el corazón de P4 — si
    // alguien reintroduce el proraeo, muere acá.
    expect(mockGateway.preferenceCalls).toHaveLength(0)
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(0)
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)

    const billing = await fetchBilling(tenantId)
    expect(billing.billed_courts).toBe(3) // lo VIGENTE no se movió
    expect(billing.pending_billed_courts).toBe(5)
    expect(new Date(billing.pending_change_at as unknown as string).toISOString()).toBe(
      '2027-05-01T00:00:00.000Z',
    )
    expect(await fetchSubStatus(tenantId)).toBe('active')
  })

  it('un segundo cambio pendiente pisa al primero: no hay plata atada, vale la última decisión', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, { billedCourts: 3 })

    await withTenantContext(tenantId, (tx) => changeBilledCourts(tenantId, 5, mockGateway, tx))
    await withTenantContext(tenantId, (tx) => changeBilledCourts(tenantId, 4, mockGateway, tx))

    // Con bandas esto era `UpgradeAlreadyPendingError`, porque el primer cambio
    // tenía una preferencia de pago viva y pisarlo dejaba ese pago huérfano.
    // Sin proraeo no hay pago que huerfanar.
    const billing = await fetchBilling(tenantId)
    expect(billing.pending_billed_courts).toBe(4)
    expect(billing.billed_courts).toBe(3)
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('pedir la cantidad que ya se factura cancela el cambio pendiente', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, { billedCourts: 3 })

    await withTenantContext(tenantId, (tx) => changeBilledCourts(tenantId, 5, mockGateway, tx))
    expect((await fetchBilling(tenantId)).pending_billed_courts).toBe(5)

    await withTenantContext(tenantId, (tx) => changeBilledCourts(tenantId, 3, mockGateway, tx))

    const billing = await fetchBilling(tenantId)
    expect(billing.pending_billed_courts).toBeNull()
    expect(billing.pending_change_at).toBeNull()
    expect(billing.billed_courts).toBe(3)
  })
})

describe('Test B2 — changeBilledCourts en TRIAL: se aplica en el acto', () => {
  it('mueve billed_courts ya y ajusta el monto del preapproval (todavía no se cobró nada)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing', {
      billedCourts: 1,
      mpSubscriptionId: 'mp-preapp-trial-1',
    })

    const result = await withTenantContext(tenant.id, (tx) =>
      changeBilledCourts(tenant.id, 5, mockGateway, tx),
    )

    expect(result.applied).toBe(true)
    expect(result.appliesAt).toBeNull()
    expect(result.previousBilledCourts).toBe(1)

    const billing = await fetchBilling(tenant.id)
    expect(billing.billed_courts).toBe(5)
    expect(billing.pending_billed_courts).toBeNull()
    expect(billing.pending_change_at).toBeNull()

    // El preapproval del trial ya existe: si el monto no se ajusta, el primer
    // cobro al final de la prueba sale por 1 cancha y el complejo opera 5.
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(1)
    expect(mockGateway.updatePreapprovalCalls[0]!.preapprovalId).toBe('mp-preapp-trial-1')
    expect(mockGateway.updatePreapprovalCalls[0]!.amount).toBe(MONTHLY_5)
    // El `reason` es el ÚNICO vínculo entre un preapproval y la cantidad de
    // canchas que representa (MP no tiene campo estructurado para eso): si
    // queda con el número viejo, el reuso de checkout pendiente deja de
    // matchear (`reusablePendingCheckout`).
    expect(mockGateway.updatePreapprovalCalls[0]!.reason).toBe('TurnoGol — 5 canchas (mensual)')
  })

  it('en trial SIN preapproval todavía: aplica local y no llama a MP', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing', { billedCourts: 1 })

    const result = await withTenantContext(tenant.id, (tx) =>
      changeBilledCourts(tenant.id, 3, mockGateway, tx),
    )

    expect(result.applied).toBe(true)
    expect((await fetchBilling(tenant.id)).billed_courts).toBe(3)
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('ciclo anual en trial: el monto nuevo es el equivalente mensual con descuento × 12', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing', {
      billedCourts: 1,
      billingCycle: 'annual',
      mpSubscriptionId: 'mp-preapp-trial-annual',
    })

    await withTenantContext(tenant.id, (tx) => changeBilledCourts(tenant.id, 3, mockGateway, tx))

    expect(mockGateway.updatePreapprovalCalls[0]!.amount).toBe(ANNUAL_3)
    expect(mockGateway.updatePreapprovalCalls[0]!.reason).toBe('TurnoGol — 3 canchas (anual)')
  })
})

// ─── Test C: voluntary cancel happy path ───────────────────────────────────

describe('Test C — voluntary cancel', () => {
  it('cancel → preapproval canceled, period_end intact; sweep at end → blocked + CANCELED_BLOCKED_DELETION_DAYS', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, {
      currentPeriodEnd: new Date(Date.now() + 86_400_000), // tomorrow
    })

    await withTenantContext(tenantId, async (tx) => {
      await billingCancel(tenantId, 'Muy caro', mockGateway, tx)
    })

    expect(mockGateway.cancelPreapprovalCalls).toHaveLength(1)
    expect(await fetchTenantStatus(sql, tenantId)).toBe('canceled')
    expect(await fetchSubStatus(tenantId)).toBe('canceled')

    // Razón de cancelación persistida (efecto secundario observable).
    const reasonRows = await asApp(
      tenantId,
      (tx) =>
        tx<{ cancellation_reason: string }[]>`
        SELECT cancellation_reason FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(reasonRows[0]!.cancellation_reason).toBe('Muy caro')

    // Period unchanged
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ current_period_end: Date | string }[]>`
        SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    const periodEnd = new Date(rows[0]!.current_period_end as unknown as string)
    expect(periodEnd.getTime()).toBeGreaterThan(Date.now())

    // Force period_end in the past then sweep
    await sql`
      UPDATE tenant_subscriptions SET current_period_end = NOW() - INTERVAL '1 hour'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()

    expect(await fetchTenantStatus(sql, tenantId)).toBe('blocked')
    // tenants es tabla GLOBAL sin RLS: se queda en el pool de siempre.
    const finalRows = await sql<{ scheduled_deletion_at: Date | string | null }[]>`
      SELECT scheduled_deletion_at FROM tenants WHERE id = ${tenantId}
    `
    const delAtRaw = finalRows[0]!.scheduled_deletion_at
    expect(delAtRaw).not.toBeNull()
    const delAt = new Date(delAtRaw as unknown as string)
    const inDays = (delAt.getTime() - Date.now()) / 86_400_000
    expect(inDays).toBeGreaterThan(CANCELED_BLOCKED_DELETION_DAYS - 1)
    expect(inDays).toBeLessThan(CANCELED_BLOCKED_DELETION_DAYS + 1)
  })
})

// ─── Test D: ELIMINADO (audit) ─────────────────────────────────────────────
// "data retention cleanup" era un SUBCONJUNTO estricto de
// tests/integration/data-retention-cleanup.test.ts, que verifica las 12 tablas
// hijas + caso negativo (sin scheduled_deletion_at) + idempotencia + email
// anonimizado + preservación del player cross-tenant (Ley 25.326). Test D solo
// chequeaba 3 tablas y no aportaba cobertura adicional. Cobertura migrada allá.

// ─── Test E (service-level) — suspended blocks billing-mutating ops ────────

describe('Test E — suspended state rejects mutations', () => {
  it('changeBilledCourts rechazado en un tenant suspended', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'suspended', {
      billedCourts: 3,
      mpSubscriptionId: 'mp-test',
      dunningStartedAt: new Date(Date.now() - 7 * 86_400_000),
    })

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await changeBilledCourts(tenant.id, 5, mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)

    // El rechazo es ANTES de tocar el gateway o la DB: sin monto cambiado en
    // MP, sin cambio pendiente, canchas facturadas intactas.
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
    const billing = await fetchBilling(tenant.id)
    expect(billing.billed_courts).toBe(3)
    expect(billing.pending_billed_courts).toBeNull()
  })

  it('subscription state still readable on suspended', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'suspended', { billedCourts: 4 })

    const state = await withTenantContext(tenant.id, async (tx) => {
      return getSubscriptionState(tenant.id, tx)
    })
    expect(state.status).toBe('suspended')
    expect(state.planSlug).toBe('turnogol')
    // Lo que la UI necesita para el desglose de precio (migr. 090).
    expect(state.billedCourts).toBe(4)
    expect(state.pendingBilledCourts).toBeNull()
  })
})

// ─── Test F — piso de canchas prendidas ───────────────────────────────────
//
// Con bandas esto era "el plan destino tiene un techo más bajo que tus
// canchas". Sin techo (P3) el gate cambió de sentido pero no desapareció: no
// se puede facturar por MENOS canchas de las que están prendidas, porque eso
// es operar de más pagando de menos — exactamente lo que el gate viejo
// impedía (ver el comentario de `toggleStatus` en canchas/actions.ts).

describe('Test F — no se puede facturar por menos canchas de las que están prendidas', () => {
  it('5 canchas online → bajar a 3 facturadas lanza DowngradeBlockedError', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, { billedCourts: 5 })
    await seedOnlineCourts(sql, tenantId, 5)

    await expect(
      withTenantContext(tenantId, async (tx) => {
        await changeBilledCourts(tenantId, 3, mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(DowngradeBlockedError)

    // El bloqueo NO debe dejar un cambio agendado ni mover lo vigente.
    const billing = await fetchBilling(tenantId)
    expect(billing.billed_courts).toBe(5)
    expect(billing.pending_billed_courts).toBeNull()
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('bajar hasta las canchas prendidas SÍ se permite (apagó 2 y las quiere dejar de pagar)', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, { billedCourts: 5 })
    await seedOnlineCourts(sql, tenantId, 3)
    // Dos apagadas: no generan reservas ni ingresos, así que no cuentan contra
    // el piso (mismo criterio que `countOnlineCourts`).
    await sql`
      INSERT INTO courts (tenant_id, name, capacity, status)
      VALUES (${tenantId}, 'En obra 1', 10, 'offline'), (${tenantId}, 'En obra 2', 10, 'offline')
    `

    const result = await withTenantContext(tenantId, (tx) =>
      changeBilledCourts(tenantId, 3, mockGateway, tx),
    )

    expect(result.applied).toBe(false)
    expect((await fetchBilling(tenantId)).pending_billed_courts).toBe(3)
  })

  // El monto del preapproval tiene que seguir a las canchas nuevas: sin el PUT,
  // MP sigue cobrando el monto viejo. Este es EL punto donde el modelo lineal
  // puede desincronizarse de MercadoPago, y el único lugar donde el monto de
  // una suscripción que ya cobra se mueve.
  it.each([
    { billingCycle: 'monthly' as const, expectedAmount: MONTHLY_3 },
    { billingCycle: 'annual' as const, expectedAmount: ANNUAL_3 },
  ])(
    'el cambio agendado se APLICA en el sweep y actualiza el monto en MP ($billingCycle)',
    async ({ billingCycle, expectedAmount }) => {
      const sql = getSql()
      const { tenantId } = await seedActiveTenant(sql, {
        billedCourts: 5,
        billingCycle,
        currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
      })
      await seedOnlineCourts(sql, tenantId, 3)

      await withTenantContext(tenantId, (tx) => changeBilledCourts(tenantId, 3, mockGateway, tx))

      // Forzar el vencimiento de pending_change_at y correr el sweep.
      await sql`
        UPDATE tenant_subscriptions SET pending_change_at = NOW() - INTERVAL '1 hour'
        WHERE tenant_id = ${tenantId}
      `
      await runDunningSweep()

      const billing = await fetchBilling(tenantId)
      expect(billing.billed_courts).toBe(3) // ya rige
      expect(billing.pending_billed_courts).toBeNull()
      expect(billing.pending_change_at).toBeNull()
      expect(await fetchSubStatus(tenantId)).toBe('active') // sigue activo
      expect(mockGateway.updatePreapprovalCalls).toHaveLength(1)
      expect(mockGateway.updatePreapprovalCalls[0]!.amount).toBe(expectedAmount)
      expect(mockGateway.updatePreapprovalCalls[0]!.reason).toBe(
        `TurnoGol — 3 canchas (${billingCycle === 'annual' ? 'anual' : 'mensual'})`,
      )
    },
  )

  it('el sweep NO aplica un cambio cuyo pending_change_at todavía no venció', async () => {
    // Control negativo del test de arriba: sin esto, un sweep que aplicara
    // TODO lo pendiente pasaría igual de verde y le cobraría de más a alguien
    // un mes antes de lo pactado.
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, {
      billedCourts: 3,
      currentPeriodEnd: new Date(Date.now() + 15 * 86_400_000),
    })

    await withTenantContext(tenantId, (tx) => changeBilledCourts(tenantId, 5, mockGateway, tx))
    await runDunningSweep()

    const billing = await fetchBilling(tenantId)
    expect(billing.billed_courts).toBe(3)
    expect(billing.pending_billed_courts).toBe(5)
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
  })
})

// ─── Subscribe + onPaymentApproved (trialing → active) ─────────────────────

describe('subscribe → first webhook activates', () => {
  it('subscribe stores preapproval; onPaymentApproved transitions trialing → active', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing')

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingSubscribe(tenant.id, 3, 'monthly', mockGateway, tx)
    })

    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(MONTHLY_3)
    expect(mockGateway.preapprovalCalls[0]!.reason).toBe('TurnoGol — 3 canchas (mensual)')

    const subRowsBefore = await asApp(
      tenant.id,
      (tx) =>
        tx<
          {
            mp_subscription_id: string | null
            status: string
            billed_courts: number
          }[]
        >`
        SELECT mp_subscription_id, status, billed_courts
        FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
    expect(subRowsBefore[0]!.mp_subscription_id).toBe(result.preapprovalId)
    expect(subRowsBefore[0]!.status).toBe('trialing')
    // Elegir plan ahora es elegir cantidad: queda persistida desde el checkout.
    expect(subRowsBefore[0]!.billed_courts).toBe(3)

    await withTenantContext(tenant.id, async (tx) => {
      await onPaymentApproved(
        tenant.id,
        'mp-evt-activate-1',
        'subscription_authorized_payment',
        { test: 1 },
        new Date(),
        tx,
      )
    })

    expect(await fetchSubStatus(tenant.id)).toBe('active')
    expect(await fetchTenantStatus(sql, tenant.id)).toBe('active')
  })

  it('subscribe por menos canchas de las prendidas → DowngradeBlockedError, sin preapproval', async () => {
    // El número llega del cliente: sin gate server-side, alguien con 5 canchas
    // se suscribe por 1 y opera igual.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing')
    await seedOnlineCourts(sql, tenant.id, 5)

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await billingSubscribe(tenant.id, 1, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(DowngradeBlockedError)
    expect(mockGateway.preapprovalCalls).toHaveLength(0)
  })
})

// ─── Reactivate from canceled before deletion ─────────────────────────────

describe('reactivate', () => {
  it('canceled with deletion_at in future → reactivate allowed', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'canceled', {
      billedCourts: 1,
      mpSubscriptionId: 'mp-old',
      canceledAt: new Date(),
      scheduledDeletionAt: new Date(Date.now() + 30 * 86_400_000),
    })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingReactivate(tenant.id, 5, 'monthly', mockGateway, tx)
    })
    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    // Reactivar por 5 canchas → preapproval por el monto de 5 canchas.
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(MONTHLY_5)

    // DB: canchas facturadas y nuevo mp_subscription_id seteados; status SIGUE
    // canceled (recién se activa con el primer onPaymentApproved, no acá).
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ billed_courts: number; mp_subscription_id: string | null; status: string }[]>`
        SELECT billed_courts, mp_subscription_id, status
        FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
    expect(rows[0]!.billed_courts).toBe(5)
    expect(rows[0]!.mp_subscription_id).toBe(result.preapprovalId)
    expect(rows[0]!.mp_subscription_id).not.toBe('mp-old') // ya no es el viejo
    expect(rows[0]!.status).toBe('canceled')
  })

  it('canceled con scheduled_deletion_at VENCIDO → reactivate lanza ReactivateNotAllowedError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'canceled', {
      mpSubscriptionId: 'mp-old',
      canceledAt: new Date(),
      scheduledDeletionAt: new Date(Date.now() - 86_400_000), // ayer (vencido)
    })

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await billingReactivate(tenant.id, 1, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)

    // Sin preapproval creado: rechazo antes de tocar el gateway.
    expect(mockGateway.preapprovalCalls).toHaveLength(0)
  })

  // ENS-20: blocked/suspended pasan a ser elegibles para reactivate() — doc4 §2
  // los clasifica como "Re-activación"/"Reintento manual" respectivamente, el
  // mismo botón de "pagar ahora" que ya tenían canceled/churned (ver
  // billing.service.ts). Reemplaza el test viejo "blocked → throws".
  it('blocked → reactivate crea un preapproval nuevo (no lanza)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'blocked', { mpSubscriptionId: 'mp-old' })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingReactivate(tenant.id, 3, 'monthly', mockGateway, tx)
    })

    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ billed_courts: number; mp_subscription_id: string | null; status: string }[]>`
        SELECT billed_courts, mp_subscription_id, status
        FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
    expect(rows[0]!.billed_courts).toBe(3)
    expect(rows[0]!.mp_subscription_id).not.toBe('mp-old')
    expect(rows[0]!.status).toBe('blocked') // reactivate() no transiciona: eso lo hace onPaymentApproved
  })

  it('suspended → reactivate crea un preapproval nuevo (no lanza)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'suspended', { mpSubscriptionId: 'mp-old' })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingReactivate(tenant.id, 1, 'monthly', mockGateway, tx)
    })

    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
  })

  it('past_due → reactivate sigue lanzando ReactivateNotAllowedError (MP ya reintenta solo)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'past_due')

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await billingReactivate(tenant.id, 1, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(mockGateway.preapprovalCalls).toHaveLength(0)
  })
})

// ─── GAP (audit): recovery past_due → active vía pago aprobado ──────────────

describe('dunning recovery — pago aprobado durante past_due', () => {
  it('past_due → active: limpia dunning_started_at y extiende el período', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, {
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    // Rechazo lleva a past_due con dunning anclado.
    await withTenantContext(tenantId, async (tx) => {
      await onPaymentRejected(
        tenantId,
        'mp-evt-reject-recovery',
        'subscription_authorized_payment',
        { test: 1 },
        new Date(),
        tx,
      )
    })
    expect(await fetchSubStatus(tenantId)).toBe('past_due')

    // Pago aprobado (evento distinto) recupera a active.
    await withTenantContext(tenantId, async (tx) => {
      await onPaymentApproved(
        tenantId,
        'mp-evt-approve-recovery',
        'subscription_authorized_payment',
        { test: 1 },
        new Date('2027-04-20T00:00:00Z'),
        tx,
      )
    })

    expect(await fetchSubStatus(tenantId)).toBe('active')
    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ dunning_started_at: Date | null; current_period_end: Date | string }[]>`
        SELECT dunning_started_at, current_period_end
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(rows[0]!.dunning_started_at).toBeNull() // ancla de dunning limpiada
    // Mensual: período extendido un mes desde el 2027-05-01 previo → 2027-06-01.
    const periodEnd = new Date(rows[0]!.current_period_end as unknown as string)
    expect(periodEnd.toISOString()).toBe('2027-06-01T00:00:00.000Z')
  })
})

// ─── GAP (audit): ciclo de facturación ANUAL (todo el resto usa monthly) ────

describe('billing cycle anual', () => {
  it('subscribe anual cobra el equivalente mensual con descuento × 12 y la activación extiende un año', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing', {
      billingCycle: 'annual',
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingSubscribe(tenant.id, 1, 'annual', mockGateway, tx)
    })
    expect(result.checkoutUrl).toContain('mp.test')
    // Una cancha, anual: el preapproval anual cobra UNA vez, así que el monto
    // es el equivalente mensual con 10% off ($42.300) × 12 = $507.600. NO el
    // mensual de lista ($47.000) ni el equivalente mensual a pelo.
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(ANNUAL_1)
    expect(mockGateway.preapprovalCalls[0]!.frequency).toBe('annual')

    const cycleRows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ billing_cycle: string }[]>`
        SELECT billing_cycle FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
    expect(cycleRows[0]!.billing_cycle).toBe('annual')

    // Primer pago aprobado activa y extiende UN AÑO (no un mes).
    await withTenantContext(tenant.id, async (tx) => {
      await onPaymentApproved(
        tenant.id,
        'mp-evt-annual-activate',
        'subscription_authorized_payment',
        { test: 1 },
        new Date('2027-04-15T00:00:00Z'),
        tx,
      )
    })
    expect(await fetchSubStatus(tenant.id)).toBe('active')
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ current_period_end: Date | string }[]>`
        SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
    const periodEnd = new Date(rows[0]!.current_period_end as unknown as string)
    expect(periodEnd.toISOString()).toBe('2028-05-01T00:00:00.000Z')
  })

  it('subscribe anual por 5 canchas: $150.300 por mes → $1.803.600 al año', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing', { billingCycle: 'annual' })

    await withTenantContext(tenant.id, (tx) =>
      billingSubscribe(tenant.id, 5, 'annual', mockGateway, tx),
    )

    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(ANNUAL_5)
    expect(mockGateway.preapprovalCalls[0]!.reason).toBe('TurnoGol — 5 canchas (anual)')
  })
})

// ─── GAP (audit): subscribe sólo es legal desde trialing ───────────────────

describe('subscribe guard de estado', () => {
  it('subscribe sobre un sub active lanza ReactivateNotAllowedError y no crea preapproval', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql)

    await expect(
      withTenantContext(tenantId, async (tx) => {
        await billingSubscribe(tenantId, 1, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(mockGateway.preapprovalCalls).toHaveLength(0)
  })
})

// ─── Residual B5: un cambio pendiente no sobrevive cancel→reactivate ───────
// El riesgo original (upgrade pendiente reaplicado tarde) sigue existiendo con
// el nombre nuevo: si `pending_billed_courts` sobreviviera a una baja y a una
// reactivación por OTRA cantidad, el sweep de dunning se lo aplicaría tarde y
// el complejo terminaría pagando por canchas que nunca pidió.

describe('cancel() no deja un cambio de canchas listo para dispararse', () => {
  it('tras cancel(), pending_change_at queda NULL y el sweep no puede aplicar nada', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, {
      billedCourts: 3,
      mpSubscriptionId: 'mp-cancel-pending-test',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    })
    await withTenantContext(tenantId, (tx) => changeBilledCourts(tenantId, 5, mockGateway, tx))
    expect((await fetchBilling(tenantId)).pending_billed_courts).toBe(5)

    await withTenantContext(tenantId, async (tx) => {
      await billingCancel(tenantId, 'me arrepentí', mockGateway, tx)
    })

    // `pending_change_at` en NULL es lo que corta el disparo: el sweep exige
    // que NO sea nulo y que esté vencido (dunning-retry.worker.ts).
    expect((await fetchBilling(tenantId)).pending_change_at).toBeNull()

    await runDunningSweep()
    expect((await fetchBilling(tenantId)).billed_courts).toBe(3)
  })
})

describe('reactivate() limpia el cambio de canchas pendiente stale', () => {
  it('sub canceled con pending_billed_courts stale → tras reactivate() queda NULL y rige lo elegido', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'canceled', {
      billedCourts: 3,
      mpSubscriptionId: 'mp-old-pending',
      canceledAt: new Date(),
      scheduledDeletionAt: new Date(Date.now() + 30 * 86_400_000),
    })
    // Cambio agendado stale: `pending_change_at` en el pasado, como dejaría un
    // cambio cuyo period_end venció sin que el sweep lo limpiara.
    await sql`
      UPDATE tenant_subscriptions
      SET pending_billed_courts = 8, pending_change_at = NOW() - INTERVAL '1 hour'
      WHERE tenant_id = ${tenant.id}
    `

    await withTenantContext(tenant.id, async (tx) => {
      await billingReactivate(tenant.id, 5, 'monthly', mockGateway, tx)
    })

    const billing = await fetchBilling(tenant.id)
    expect(billing.billed_courts).toBe(5) // lo que el dueño acaba de elegir
    expect(billing.pending_billed_courts).toBeNull()
    expect(billing.pending_change_at).toBeNull()

    // Y el sweep ya no tiene nada que reaplicar: sin esto, el complejo
    // terminaría pagando por 8 canchas que nunca pidió.
    await runDunningSweep()
    expect((await fetchBilling(tenant.id)).billed_courts).toBe(5)
  })
})

// ─── payer_email de MercadoPago (migr. 078) ────────────────────────────────

describe('con qué cuenta de MercadoPago paga el complejo', () => {
  it('subscribe cobra al email declarado; sin declarar, al del dueño (admin, no el encargado)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql, { email: `owner-${tenant.id}@staff.local` })
    const manager = await createTestStaffUser(sql, { email: `manager-${tenant.id}@staff.local` })
    // El encargado se linkea PRIMERO: sin el ORDER BY del LATERAL, las
    // subqueries de loadTenantOwner podían devolver a este y cobrarle a él.
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    await linkStaffToTenant(sql, tenant.id, owner.id, 'admin')
    await seedSubscription(sql, tenant.id, 'trialing')

    const before = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
    expect(before.override).toBeNull()
    expect(before.ownerEmail).toBe(owner.email)
    expect(before.effective).toBe(owner.email)

    await withTenantContext(tenant.id, (tx) =>
      billingSubscribe(tenant.id, 1, 'monthly', mockGateway, tx),
    )
    expect(mockGateway.preapprovalCalls[0]!.payerEmail).toBe(owner.email)

    const mpEmail = 'cuenta.mp@gmail.com'
    const { previous } = await withTenantContext(tenant.id, (tx) =>
      setBillingPayerEmail(tenant.id, mpEmail, tx),
    )
    expect(previous).toBeNull()

    const after = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
    expect(after.override).toBe(mpEmail)
    expect(after.effective).toBe(mpEmail)
    expect(after.ownerEmail).toBe(owner.email)

    // Re-subscribe durante el trial: el segundo preapproval ya va al email
    // declarado, que es el flujo que destrabó el caso real de producción.
    await withTenantContext(tenant.id, (tx) =>
      billingSubscribe(tenant.id, 1, 'monthly', mockGateway, tx),
    )
    expect(mockGateway.preapprovalCalls[1]!.payerEmail).toBe(mpEmail)
  })

  it('vaciar el email vuelve al del dueño y devuelve el valor anterior para la auditoría', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    await seedSubscription(sql, tenant.id, 'trialing')

    await withTenantContext(tenant.id, (tx) =>
      setBillingPayerEmail(tenant.id, 'cuenta.mp@gmail.com', tx),
    )
    const { previous } = await withTenantContext(tenant.id, (tx) =>
      setBillingPayerEmail(tenant.id, null, tx),
    )

    expect(previous).toBe('cuenta.mp@gmail.com')
    const state = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
    expect(state.override).toBeNull()
    expect(state.effective).toBe(owner.email)

    // El mismo UPDATE, pero con el ROL DE LA APP y RLS puestos (`asApp`): el
    // pool de `withTenantContext` corre con el DSN superusuario en local, así
    // que por sí solo no prueba que la policy deje escribir esta columna.
    // El CTE con FOR UPDATE es el que necesita, además del SELECT, el USING de
    // la policy de UPDATE.
    const asAppRows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ previous: string | null }[]>`
        WITH prev AS (
          SELECT tenant_id, mp_payer_email
          FROM tenant_subscriptions
          WHERE tenant_id = ${tenant.id}
          FOR UPDATE
        )
        UPDATE tenant_subscriptions ts
        SET mp_payer_email = ${'otra.cuenta@gmail.com'},
            updated_at = NOW()
        FROM prev
        WHERE ts.tenant_id = prev.tenant_id
        RETURNING prev.mp_payer_email AS "previous"
      `,
    )
    expect(asAppRows).toHaveLength(1)
    expect(asAppRows[0]!.previous).toBeNull()
  })
})
