import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, addMonths } from 'date-fns'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { clearFeatureFlagCache, isFeatureEnabled } from '@/shared/feature-flags'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import {
  cancel as billingCancel,
  changeBilledCourts,
  getSubscriptionState,
  reactivate as billingReactivate,
  subscribe as billingSubscribe,
} from '@/modules/billing/billing.service'
import {
  disablePlus,
  enablePlus,
  ensurePlusFlagOn,
  getBotFlagOn,
  getPlusAdminState,
  startPlusProratePayment,
  type PlusActor,
} from '@/modules/billing/plus.service'
import { onPaymentApproved, onPaymentRejected } from '@/modules/billing/dunning.service'
import { PlusNotAllowedError, PlusQuoteNotPendingError } from '@/modules/billing/billing.errors'
import { InvalidPlusPriceError } from '@/modules/billing/pricing'
import { changeBilledCourtsForSupport } from '@/modules/super-admin/support.service'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'
import {
  cleanupAll,
  createTestStaffUser,
  createTestSystemAdmin,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import type { Sql } from 'postgres'

/**
 * TurnoGol Plus en el cobro (Fase A). Decisión: `docs/decisions/2026-10-22-cobro-turnogol-plus.md`.
 *
 * Los montos están escritos a mano (plan $30.000 por cancha, Plus de lista
 * $15.000 por cancha, anual 10% sobre la suma): un test que recalcula con la
 * misma fórmula que el código no prueba nada. Las fechas salen de un `NOW`
 * inyectado, nunca del reloj.
 */

const NOW = new Date('2027-03-10T12:00:00Z')
/** 5 canchas: plan $150.000 + Plus 5 x $15.000. */
const PLAN_5 = 15_000_000
const WITH_PLUS_5 = 22_500_000
/** Plus especial $12.000 por cancha. */
const WITH_SPECIAL_5 = 21_000_000
const PLUS_REASON_5 = 'TurnoGol — 5 canchas + Asistente de WhatsApp (mensual)'
const PLAN_REASON_5 = 'TurnoGol — 5 canchas (mensual)'

let planId: string
let systemAdminId: string
let actor: PlusActor
let gateway: MockGateway

async function loadActivePlanId(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
  `
  const id = rows[0]?.id
  if (!id) throw new Error('no hay plan activo')
  return id
}

type SeedOpts = {
  billedCourts?: number
  billingCycle?: 'monthly' | 'annual'
  periodEnd?: Date
  mpSubscriptionId?: string | null
  plusEnabled?: boolean
  plusPrice?: number | null
  plusAccessUntil?: Date | null
  scheduledDeletionAt?: Date | null
}

/** Complejo con dueño (necesario para `subscribe`/`reactivate`) y suscripción. */
async function seed(sql: Sql, status: string, opts: SeedOpts = {}): Promise<string> {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const periodEnd = (opts.periodEnd ?? addDays(NOW, 20)).toISOString()
  const periodStart = addMonths(new Date(periodEnd), opts.billingCycle === 'annual' ? -12 : -1)
  const mpId =
    opts.mpSubscriptionId === undefined ? `mp-preapp-${tenant.id}` : opts.mpSubscriptionId
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, billed_courts, status,
      current_period_start, current_period_end, mp_subscription_id,
      plus_enabled, plus_price_per_court_cents, plus_access_until,
      scheduled_deletion_at
    ) VALUES (
      ${tenant.id}, ${planId}, ${opts.billingCycle ?? 'monthly'}::billing_cycle,
      ${opts.billedCourts ?? 5}, ${status}::subscription_status,
      ${periodStart.toISOString()}::timestamptz, ${periodEnd}::timestamptz, ${mpId},
      ${opts.plusEnabled ?? false}, ${opts.plusPrice ?? null},
      ${opts.plusAccessUntil ? opts.plusAccessUntil.toISOString() : null}::timestamptz,
      ${opts.scheduledDeletionAt ? opts.scheduledDeletionAt.toISOString() : null}::timestamptz
    )
  `
  await sql`UPDATE tenants SET status = ${status}::tenant_status WHERE id = ${tenant.id}`
  return tenant.id
}

type PlusRow = {
  status: string
  plus_enabled: boolean
  plus_price_per_court_cents: number | null
  plus_access_until: Date | string | null
  plus_prorate_cents: number | null
  plus_prorate_months: number | null
  current_period_end: Date | string
  mp_subscription_id: string | null
}

async function plusRow(tenantId: string): Promise<PlusRow> {
  const rows = await getSql()<PlusRow[]>`
    SELECT status, plus_enabled, plus_price_per_court_cents, plus_access_until,
           plus_prorate_cents, plus_prorate_months, current_period_end, mp_subscription_id
    FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return rows[0]!
}

/** `feature_flags` no tiene policy de escritura para la app: se lee con el superuser del test. */
async function overrideRows(tenantId: string): Promise<boolean[]> {
  const rows = await getSql()<{ value: boolean }[]>`
    SELECT value FROM feature_flags WHERE key = ${BOT_FEATURE_FLAG} AND tenant_id = ${tenantId}
  `
  return rows.map((r) => r.value)
}

async function setOverrideBySql(tenantId: string, value: boolean): Promise<void> {
  await getSql()`
    INSERT INTO feature_flags (key, value, tenant_id) VALUES (${BOT_FEATURE_FLAG}, ${value}, ${tenantId})
    ON CONFLICT (key, tenant_id) WHERE tenant_id IS NOT NULL DO UPDATE SET value = ${value}
  `
}

async function auditCount(tenantId: string, action: string): Promise<number> {
  const rows = await getSql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = ${tenantId} AND action = ${action}
  `
  return rows[0]!.n
}

const enable = (tenantId: string, price: number | null = null, now = NOW) =>
  enablePlus(tenantId, { pricePerCourtCents: price }, actor, gateway, now)
const disable = (
  tenantId: string,
  mode: 'end_of_period' | 'immediate' = 'end_of_period',
  now = NOW,
) =>
  disablePlus(
    tenantId,
    { mode },
    mode === 'immediate' ? { type: 'system', id: systemAdminId } : actor,
    gateway,
    now,
  )

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  planId = await loadActivePlanId(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

beforeEach(async () => {
  clearFeatureFlagCache()
  gateway = new MockGateway()
  setBillingGateway(gateway)
  systemAdminId = (await createTestSystemAdmin(getSql())).id
  actor = { type: 'system', id: systemAdminId }
})

afterEach(async () => {
  setBillingGateway(null)
  await getSql()`TRUNCATE TABLE notifications, audit_logs, tenant_subscriptions, tenant_staff_members, courts, tenants, staff_users, processed_webhooks, feature_flags RESTART IDENTITY CASCADE`
})

// ─── Alta ────────────────────────────────────────────────────────────────────

describe('alta de Plus (AL1-AL6)', () => {
  it('AL1: active mensual con débito: MP sube UNA vez a plan + Plus, la DB y el flag quedan prendidos, con audit', async () => {
    const t = await seed(getSql(), 'active')

    const res = await enable(t)

    expect(res).toEqual({ kind: 'enabled' })
    expect(gateway.updatePreapprovalCalls).toEqual([
      { preapprovalId: `mp-preapp-${t}`, amount: WITH_PLUS_5, reason: PLUS_REASON_5 },
    ])
    const row = await plusRow(t)
    expect(row.plus_enabled).toBe(true)
    expect(row.plus_access_until).toBeNull()
    expect(await overrideRows(t)).toEqual([true])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, t)).toBe(true)
    expect(await auditCount(t, 'plus.enabled')).toBe(1)
  })

  it('F5: prender con precio null deja plus_price_per_court_cents en NULL (sigue a la lista) y cobra la lista', async () => {
    const t = await seed(getSql(), 'active')

    await enable(t, null)

    expect((await plusRow(t)).plus_price_per_court_cents).toBeNull()
    expect(gateway.updatePreapprovalCalls[0]!.amount).toBe(WITH_PLUS_5)
  })

  it('AL2: si MP falla NO queda plus_enabled, ni override, ni audit (rollback total), y el error llega al caller', async () => {
    const t = await seed(getSql(), 'active')
    gateway.updatePreapprovalError = new Error('MP 500')

    await expect(enable(t)).rejects.toThrow('MP 500')

    const row = await plusRow(t)
    expect(row.plus_enabled).toBe(false)
    expect(row.plus_price_per_court_cents).toBeNull()
    expect(await overrideRows(t)).toEqual([])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, t)).toBe(false)
    expect(await auditCount(t, 'plus.enabled')).toBe(0)
  })

  it('AL3: dos veces seguidas = un solo cambio efectivo (el monto NUNCA es plan + 2 x Plus)', async () => {
    const t = await seed(getSql(), 'active')

    expect(await enable(t)).toEqual({ kind: 'enabled' })
    expect(await enable(t)).toEqual({ kind: 'unchanged' })

    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect(gateway.updatePreapprovalCalls[0]!.amount).toBe(WITH_PLUS_5)
    expect(await auditCount(t, 'plus.enabled')).toBe(1)
    expect(await overrideRows(t)).toEqual([true])
  })

  it('AL3: doble click simultáneo (Promise.all) = un solo cambio efectivo', async () => {
    const t = await seed(getSql(), 'active')

    const results = await Promise.all([enable(t), enable(t)])

    expect(results.map((r) => r.kind).sort()).toEqual(['enabled', 'unchanged'])
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect(gateway.updatePreapprovalCalls[0]!.amount).toBe(WITH_PLUS_5)
    expect(await auditCount(t, 'plus.enabled')).toBe(1)
    expect(await overrideRows(t)).toEqual([true])
  })

  it('AL4: trialing sin débito: no toca MP y el primer checkout de subscribe() lleva plan + Plus', async () => {
    const sql = getSql()
    const t = await seed(sql, 'trialing', { mpSubscriptionId: null, billedCourts: 2 })

    await enable(t)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    expect((await plusRow(t)).plus_enabled).toBe(true)

    await withTenantContext(t, (tx) => billingSubscribe(t, 2, 'monthly', gateway, tx, NOW))
    expect(gateway.preapprovalCalls).toHaveLength(1)
    // 2 canchas: plan $60.000 + Plus 2 x $15.000.
    expect(gateway.preapprovalCalls[0]!.amount).toBe(9_000_000)
    expect(gateway.preapprovalCalls[0]!.reason).toBe(
      'TurnoGol — 2 canchas + Asistente de WhatsApp (mensual)',
    )
  })

  it('AL4: un checkout pendiente SIN Plus (plan solo) no se reusa una vez que Plus está prendido', async () => {
    const sql = getSql()
    const t = await seed(sql, 'trialing', {
      mpSubscriptionId: 'pa-viejo',
      billedCourts: 2,
      plusEnabled: true,
    })
    gateway.subscriptionState = {
      preapprovalId: 'pa-viejo',
      status: 'pending',
      externalReference: t,
      nextPaymentDate: null,
      chargedQuantity: 0,
      lastChargedDate: null,
      lastChargedAmountCents: null,
      initPoint: 'https://mp.test/viejo',
      amountCents: 6_000_000,
      reason: 'TurnoGol — 2 canchas (mensual)',
      frequency: 1,
      frequencyType: 'months',
      startDate: null,
    }

    await withTenantContext(t, (tx) => billingSubscribe(t, 2, 'monthly', gateway, tx, NOW))

    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(gateway.preapprovalCalls[0]!.amount).toBe(9_000_000)
  })

  it.each(['past_due', 'suspended', 'blocked', 'canceled', 'churned'] as const)(
    'AL5: %s no puede prender Plus (y no queda flag)',
    async (status) => {
      const t = await seed(getSql(), status)

      await expect(enable(t)).rejects.toBeInstanceOf(PlusNotAllowedError)

      expect((await plusRow(t)).plus_enabled).toBe(false)
      expect(await overrideRows(t)).toEqual([])
      expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    },
  )

  it('AL5: control positivo, trialing y active sí pueden', async () => {
    const sql = getSql()
    for (const status of ['trialing', 'active'] as const) {
      const t = await seed(sql, status, { mpSubscriptionId: null })
      await expect(enable(t)).resolves.toEqual({ kind: 'enabled' })
    }
  })

  it('AL6: cambiar el precio especial mueve el débito (mensual y anual) y el especial manda sobre la lista', async () => {
    const sql = getSql()
    const monthly = await seed(sql, 'active')
    await enable(monthly, 1_200_000)
    expect(gateway.updatePreapprovalCalls.at(-1)!.amount).toBe(WITH_SPECIAL_5)

    const res = await enable(monthly, 1_800_000)
    expect(res).toEqual({ kind: 'price_changed' })
    // 5 x ($30.000 + $18.000)
    expect(gateway.updatePreapprovalCalls.at(-1)!.amount).toBe(24_000_000)
    expect((await plusRow(monthly)).plus_price_per_court_cents).toBe(1_800_000)
    expect(await auditCount(monthly, 'plus.price_changed')).toBe(1)

    // Anual SIN meses completos por delante (queda < 1 mes): entra al débito como mensual.
    const annual = await seed(sql, 'active', {
      billingCycle: 'annual',
      periodEnd: addDays(NOW, 10),
    })
    await enable(annual, 1_800_000)
    // (150.000 + 90.000) x 0,9 = 216.000 x 12
    expect(gateway.updatePreapprovalCalls.at(-1)!.amount).toBe(21_600_000 * 12)
  })

  it.each([0, -5, 1.5])('P10: precio especial %s es inválido y no escribe nada', async (bad) => {
    const t = await seed(getSql(), 'active')

    await expect(enable(t, bad)).rejects.toBeInstanceOf(InvalidPlusPriceError)

    expect((await plusRow(t)).plus_enabled).toBe(false)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    expect(await overrideRows(t)).toEqual([])
  })
})

// ─── Anual: cotización ───────────────────────────────────────────────────────

describe('alta en un anual ya pago (AN1)', () => {
  it('AN1: congela la cotización (meses completos, redondeo para abajo), NO prende, NO toca MP', async () => {
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd: addDays(addMonths(NOW, 5), 12),
    })

    const res = await enable(t, 1_500_000)

    // 5 meses x (5 canchas x $15.000 x 0,9 = $67.500) = $337.500
    expect(res).toEqual({ kind: 'quote_pending', months: 5, amountCents: 33_750_000 })
    const row = await plusRow(t)
    expect(row.plus_enabled).toBe(false)
    expect(row.plus_prorate_cents).toBe(33_750_000)
    expect(row.plus_prorate_months).toBe(5)
    expect(row.plus_price_per_court_cents).toBe(1_500_000)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    expect(await overrideRows(t)).toEqual([])
    expect(await auditCount(t, 'plus.quote_created')).toBe(1)
  })

  it('AN1: repetir el alta con la misma cotización no la recalcula ni duplica el audit', async () => {
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd: addMonths(NOW, 5),
    })

    await enable(t, 1_500_000)
    // Pasó un día: recalcular daría lo mismo acá, pero con 6 meses justos cambiaría.
    expect(await enable(t, 1_500_000, addDays(NOW, 1))).toEqual({ kind: 'unchanged' })
    expect(await auditCount(t, 'plus.quote_created')).toBe(1)
  })

  it('AN1: con 0 meses completos por delante se comporta como mensual (entra al débito, sin pago)', async () => {
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd: addDays(NOW, 20),
    })

    expect(await enable(t)).toEqual({ kind: 'enabled' })
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect((await plusRow(t)).plus_prorate_cents).toBeNull()
  })

  it('AN1: el link de pago usa external_reference saas-plus, el monto congelado y notificación con source=saas', async () => {
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd: addMonths(NOW, 5),
    })
    await enable(t, 1_500_000)

    const { checkoutUrl } = await startPlusProratePayment(t, gateway, NOW)

    expect(checkoutUrl).toContain('mp.test')
    expect(gateway.plusPreferenceCalls).toHaveLength(1)
    const call = gateway.plusPreferenceCalls[0]!
    expect(call.externalReference).toBe(`saas-plus:${t}`)
    expect(call.amount).toBe(33_750_000)
    expect(call.notificationUrl).toContain('source=saas')
    expect(call.expiresAt.getTime()).toBe(NOW.getTime() + 24 * 60 * 60 * 1000)
  })

  it('AN1: sin cotización pendiente no hay link de pago', async () => {
    const t = await seed(getSql(), 'active')
    await expect(startPlusProratePayment(t, gateway, NOW)).rejects.toBeInstanceOf(
      PlusQuoteNotPendingError,
    )
    expect(gateway.plusPreferenceCalls).toHaveLength(0)
  })

  it('la baja descarta una cotización pendiente sin tocar MP ni el flag', async () => {
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd: addMonths(NOW, 5),
    })
    await enable(t, 1_500_000)

    expect(await disable(t)).toEqual({ kind: 'quote_cleared' })

    const row = await plusRow(t)
    expect(row.plus_prorate_cents).toBeNull()
    expect(row.plus_price_per_court_cents).toBeNull()
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    expect(await auditCount(t, 'plus.quote_cleared')).toBe(1)
  })
})

// ─── Baja ────────────────────────────────────────────────────────────────────

describe('baja de Plus (BJ1-BJ6)', () => {
  it('BJ1: el débito baja YA (sin Plus), el acceso sigue hasta el fin del período y el flag NO se apaga', async () => {
    const t = await seed(getSql(), 'active')
    await enable(t)
    gateway.updatePreapprovalCalls.length = 0
    const periodEnd = new Date((await plusRow(t)).current_period_end)

    const res = await disable(t)

    expect(res).toEqual({ kind: 'scheduled', accessUntil: periodEnd })
    expect(gateway.updatePreapprovalCalls).toEqual([
      { preapprovalId: `mp-preapp-${t}`, amount: PLAN_5, reason: PLAN_REASON_5 },
    ])
    const row = await plusRow(t)
    expect(row.plus_enabled).toBe(false)
    expect(new Date(row.plus_access_until!).getTime()).toBe(periodEnd.getTime())
    expect(await overrideRows(t)).toEqual([true])
    expect(await auditCount(t, 'plus.end_scheduled')).toBe(1)
  })

  it('BJ1: bajar dos veces no duplica nada', async () => {
    const t = await seed(getSql(), 'active')
    await enable(t)
    await disable(t)
    expect(await disable(t)).toEqual({ kind: 'unchanged' })
    expect(await auditCount(t, 'plus.end_scheduled')).toBe(1)
  })

  it('BJ2: el barrido apaga el flag vencido (sin importar el estado), limpia la fecha y es idempotente', async () => {
    const sql = getSql()
    const ids = {
      canceled: await seed(sql, 'canceled', { plusAccessUntil: addDays(NOW, -1) }),
      pastDue: await seed(sql, 'past_due', { plusAccessUntil: addDays(NOW, -1) }),
      active: await seed(sql, 'active', { plusAccessUntil: addDays(NOW, -1) }),
      notYet: await seed(sql, 'active', { plusAccessUntil: addDays(NOW, 3) }),
    }
    for (const id of Object.values(ids)) await setOverrideBySql(id, true)

    await runDunningSweep(NOW)
    await runDunningSweep(NOW)

    for (const id of [ids.canceled, ids.pastDue, ids.active]) {
      expect(await overrideRows(id)).toEqual([false])
      expect((await plusRow(id)).plus_access_until).toBeNull()
      expect(await auditCount(id, 'plus.access_expired')).toBe(1)
    }
    // Todavía no venció: intacto.
    expect(await overrideRows(ids.notYet)).toEqual([true])
    expect((await plusRow(ids.notYet)).plus_access_until).not.toBeNull()
  })

  it('BJ3: volver a prender ANTES del vencimiento limpia la fecha y el barrido no lo apaga', async () => {
    const t = await seed(getSql(), 'active')
    await enable(t)
    await disable(t)
    expect(await enable(t)).toEqual({ kind: 'enabled' })
    expect((await plusRow(t)).plus_access_until).toBeNull()

    await runDunningSweep(addDays(NOW, 40))

    expect(await overrideRows(t)).toEqual([true])
    expect((await plusRow(t)).plus_enabled).toBe(true)
    // Y MP volvió a llevar Plus.
    expect(gateway.updatePreapprovalCalls.at(-1)!.amount).toBe(WITH_PLUS_5)
  })

  it('BJ4: el override manual de un complejo sin Plus en la suscripción (El Vagón) NO lo toca el barrido; el vencido del mismo tick sí', async () => {
    const sql = getSql()
    const manual = await seed(sql, 'active')
    const expired = await seed(sql, 'active', { plusAccessUntil: addDays(NOW, -1) })
    await setOverrideBySql(manual, true)
    await setOverrideBySql(expired, true)

    await runDunningSweep(NOW)

    expect(await overrideRows(manual)).toEqual([true])
    expect(await overrideRows(expired)).toEqual([false])
    // Y el cálculo del débito del manual no cobra Plus.
    clearFeatureFlagCache()
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, manual)).toBe(true)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('BJ5: baja del PLAN: Plus no se apaga ya, queda hasta el fin del período; vence y el barrido apaga; reactivar NO lo devuelve', async () => {
    const sql = getSql()
    const periodEnd = addDays(NOW, 20)
    const t = await seed(sql, 'active', {
      periodEnd,
      scheduledDeletionAt: addDays(NOW, 60),
    })
    await enable(t)

    await withTenantContext(t, (tx) => billingCancel(t, 'muy caro', gateway, tx))

    const afterCancel = await plusRow(t)
    expect(afterCancel.plus_enabled).toBe(false)
    expect(new Date(afterCancel.plus_access_until!).getTime()).toBe(periodEnd.getTime())
    expect(await overrideRows(t)).toEqual([true])
    expect(await auditCount(t, 'plus.end_scheduled')).toBeGreaterThanOrEqual(1)

    // Pasó el período pago: el barrido apaga el bot.
    await runDunningSweep(addDays(periodEnd, 1))
    expect(await overrideRows(t)).toEqual([false])

    // Reactivar el plan NO devuelve Plus: monto solo del plan y flag coherente (apagado).
    await sql`UPDATE tenant_subscriptions SET scheduled_deletion_at = ${addDays(new Date(), 60).toISOString()}::timestamptz WHERE tenant_id = ${t}`
    await sql`UPDATE tenants SET scheduled_deletion_at = ${addDays(new Date(), 60).toISOString()}::timestamptz WHERE id = ${t}`
    gateway.preapprovalCalls.length = 0
    await withTenantContext(t, (tx) => billingReactivate(t, 5, 'monthly', gateway, tx))
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(gateway.preapprovalCalls[0]!.amount).toBe(PLAN_5)
    expect(gateway.preapprovalCalls[0]!.reason).toContain(PLAN_REASON_5)
    expect(gateway.preapprovalCalls[0]!.reason).not.toContain('Asistente')
    const final = await plusRow(t)
    expect(final.plus_enabled).toBe(false)
    expect(await overrideRows(t)).toEqual([false])
  })

  it('F4: anual con Plus -> cancel -> reactivate (año nuevo) -> prender antes del fin del período viejo cotiza: no regala Plus', async () => {
    const sql = getSql()
    const oldEnd = addMonths(NOW, 2)
    const t = await seed(sql, 'active', {
      billingCycle: 'annual',
      periodEnd: oldEnd,
      scheduledDeletionAt: addDays(NOW, 60),
    })
    await enable(t, 1_500_000)
    await withTenantContext(t, (tx) => billingCancel(t, 'pausa', gateway, tx))
    await sql`UPDATE tenant_subscriptions SET scheduled_deletion_at = ${addDays(new Date(), 60).toISOString()}::timestamptz WHERE tenant_id = ${t}`
    await sql`UPDATE tenants SET scheduled_deletion_at = ${addDays(new Date(), 60).toISOString()}::timestamptz WHERE id = ${t}`
    await withTenantContext(t, (tx) => billingReactivate(t, 5, 'annual', gateway, tx))
    // El primer pago del año nuevo (lo que hace el webhook): período nuevo y activo.
    const newEnd = addMonths(NOW, 12)
    await sql`
      UPDATE tenant_subscriptions
      SET status = 'active'::subscription_status,
          current_period_start = ${NOW.toISOString()}::timestamptz,
          current_period_end = ${newEnd.toISOString()}::timestamptz
      WHERE tenant_id = ${t}
    `
    gateway.updatePreapprovalCalls.length = 0

    const res = await enable(t, 1_500_000, addDays(NOW, 1))

    // 11 meses completos x (5 x $15.000 x 0,9 = $67.500)
    expect(res).toEqual({ kind: 'quote_pending', months: 11, amountCents: 74_250_000 })
    const row = await plusRow(t)
    expect(row.plus_enabled).toBe(false)
    expect(row.plus_prorate_cents).toBe(74_250_000)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('F4: control positivo: baja normal del anual y volver a prender dentro del mismo período no cotiza ni cobra de nuevo', async () => {
    // Plus ya facturado (año pago con Plus): baja normal a fin de período.
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd: addMonths(NOW, 5),
      plusEnabled: true,
      plusPrice: 1_500_000,
    })
    await disable(t)
    const mid = await plusRow(t)
    expect(mid.plus_enabled).toBe(false)

    const res = await enable(t, 1_500_000, addDays(NOW, 1))

    expect(res).toEqual({ kind: 'enabled' })
    const row = await plusRow(t)
    expect(row.plus_enabled).toBe(true)
    expect(row.plus_prorate_cents).toBeNull()
  })

  it('BJ5: cancelar un plan sin Plus no escribe nada de Plus', async () => {
    const t = await seed(getSql(), 'active')
    await withTenantContext(t, (tx) => billingCancel(t, 'muy caro', gateway, tx))
    expect(await auditCount(t, 'plus.end_scheduled')).toBe(0)
    expect(await overrideRows(t)).toEqual([])
  })

  it('BJ6: anual, si MP falla en la baja se hace rollback de plus_enabled y plus_access_until', async () => {
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd: addDays(NOW, 20),
      plusEnabled: true,
    })
    await ensurePlusFlagOn(t)
    gateway.updatePreapprovalError = new Error('MP caído')

    await expect(disable(t)).rejects.toThrow('MP caído')

    const row = await plusRow(t)
    expect(row.plus_enabled).toBe(true)
    expect(row.plus_access_until).toBeNull()
    expect(await overrideRows(t)).toEqual([true])
    expect(await auditCount(t, 'plus.end_scheduled')).toBe(0)
  })

  it('BJ6: anual, la baja deja el acceso hasta el fin del período y el débito de renovación sin Plus', async () => {
    const periodEnd = addMonths(NOW, 9)
    const t = await seed(getSql(), 'active', {
      billingCycle: 'annual',
      periodEnd,
      plusEnabled: true,
    })

    await disable(t)

    // 5 canchas anual sin Plus: $150.000 x 0,9 = $135.000 x 12 = $1.620.000
    expect(gateway.updatePreapprovalCalls.at(-1)!.amount).toBe(162_000_000)
    expect(new Date((await plusRow(t)).plus_access_until!).getTime()).toBe(periodEnd.getTime())
  })

  it('baja inmediata: solo del super-admin; apaga el débito y el bot YA, y se puede apagar un override manual', async () => {
    const sql = getSql()
    const billed = await seed(sql, 'active')
    await enable(billed)

    await expect(
      disablePlus(billed, { mode: 'immediate' }, { type: 'staff', id: 's' }, gateway, NOW),
    ).rejects.toThrow()
    expect((await plusRow(billed)).plus_enabled).toBe(true)

    expect(await disable(billed, 'immediate')).toEqual({ kind: 'turned_off' })
    expect((await plusRow(billed)).plus_enabled).toBe(false)
    expect(await overrideRows(billed)).toEqual([false])
    expect(gateway.updatePreapprovalCalls.at(-1)!.amount).toBe(PLAN_5)

    const manual = await seed(sql, 'active')
    await setOverrideBySql(manual, true)
    expect(await disable(manual, 'immediate')).toEqual({ kind: 'turned_off' })
    expect(await overrideRows(manual)).toEqual([false])
    // Sin Plus en la suscripción no hay nada que bajarle a MP.
    expect(
      gateway.updatePreapprovalCalls.filter((c) => c.preapprovalId === `mp-preapp-${manual}`),
    ).toHaveLength(0)

    // Sin nada que apagar no crea un override de la nada.
    const nothing = await seed(sql, 'active')
    expect(await disable(nothing, 'immediate')).toEqual({ kind: 'unchanged' })
    expect(await overrideRows(nothing)).toEqual([])
  })
})

// ─── Curación del flag ───────────────────────────────────────────────────────

describe('curación del flag', () => {
  it('un Plus cobrándose sin override (el prendido falló tras el commit) lo cura el barrido diario', async () => {
    const t = await seed(getSql(), 'active', { plusEnabled: true })
    expect(await overrideRows(t)).toEqual([])

    await runDunningSweep(NOW)

    expect(await overrideRows(t)).toEqual([true])
  })

  it('ensurePlusFlagOn no prende un complejo sin plus_enabled', async () => {
    const t = await seed(getSql(), 'active')
    await ensurePlusFlagOn(t)
    expect(await overrideRows(t)).toEqual([])
  })
})

// ─── Sitios de monto ─────────────────────────────────────────────────────────

describe('todos los sitios que arman el monto llevan Plus (CB1-CB3)', () => {
  it('CB1: el barrido que aplica el cambio de canchas conserva Plus en el débito', async () => {
    const sql = getSql()
    const t = await seed(sql, 'active', { billedCourts: 5, plusEnabled: true })
    await sql`
      UPDATE tenant_subscriptions
      SET pending_billed_courts = 4, pending_change_at = NOW() - INTERVAL '1 hour'
      WHERE tenant_id = ${t}
    `

    await runDunningSweep(NOW)

    // 4 canchas: plan $120.000 + Plus 4 x $15.000.
    expect(gateway.updatePreapprovalCalls).toEqual([
      {
        preapprovalId: `mp-preapp-${t}`,
        amount: 18_000_000,
        reason: 'TurnoGol — 4 canchas + Asistente de WhatsApp (mensual)',
      },
    ])
  })

  it('CB2: changeBilledCourts en prueba conserva Plus', async () => {
    const t = await seed(getSql(), 'trialing', { billedCourts: 1, plusEnabled: true })

    await withTenantContext(t, (tx) => changeBilledCourts(t, 5, gateway, tx))

    expect(gateway.updatePreapprovalCalls).toEqual([
      { preapprovalId: `mp-preapp-${t}`, amount: WITH_PLUS_5, reason: PLUS_REASON_5 },
    ])
  })

  it('CB2: soporte corrigiendo las canchas conserva Plus', async () => {
    const t = await seed(getSql(), 'active', { billedCourts: 3, plusEnabled: true })

    await changeBilledCourtsForSupport(t, 5, systemAdminId, gateway)

    expect(gateway.updatePreapprovalCalls).toEqual([
      { preapprovalId: `mp-preapp-${t}`, amount: WITH_PLUS_5, reason: PLUS_REASON_5 },
    ])
  })

  it('CB3: subscribe y reactivate cobran plan + Plus especial', async () => {
    const sql = getSql()
    const trial = await seed(sql, 'trialing', {
      mpSubscriptionId: null,
      plusEnabled: true,
      plusPrice: 1_200_000,
    })
    await withTenantContext(trial, (tx) => billingSubscribe(trial, 5, 'monthly', gateway, tx, NOW))
    expect(gateway.preapprovalCalls.at(-1)!.amount).toBe(WITH_SPECIAL_5)

    // reactivate: la baja del PLAN se llevó a Plus; el estado final de Plus cobra Plus solo si plus_enabled.
    const canceled = await seed(sql, 'canceled', {
      mpSubscriptionId: null,
      plusEnabled: true,
      plusPrice: 1_200_000,
      scheduledDeletionAt: addDays(NOW, 30),
    })
    await withTenantContext(canceled, (tx) =>
      billingReactivate(canceled, 5, 'monthly', gateway, tx, NOW),
    )
    expect(gateway.preapprovalCalls.at(-1)!.amount).toBe(WITH_SPECIAL_5)
  })

  it('un complejo con el bot prendido por SQL pero sin plus_enabled no paga Plus en ningún sitio', async () => {
    const sql = getSql()
    const t = await seed(sql, 'trialing', { mpSubscriptionId: null, billedCourts: 5 })
    await setOverrideBySql(t, true)

    await withTenantContext(t, (tx) => billingSubscribe(t, 5, 'monthly', gateway, tx, NOW))

    expect(gateway.preapprovalCalls[0]!.amount).toBe(PLAN_5)
  })
})

// ─── Mora ────────────────────────────────────────────────────────────────────

describe('mora con Plus (MO1)', () => {
  it('el rechazo del débito manda TODO a past_due (Plus no tiene mora propia) y el cobro posterior lo deja intacto', async () => {
    const t = await seed(getSql(), 'active')
    await enable(t)

    await withTenantContext(t, (tx) =>
      onPaymentRejected(t, 'mp-evt-rej-1', 'subscription_authorized_payment', {}, NOW, tx),
    )
    const pastDue = await plusRow(t)
    expect(pastDue.status).toBe('past_due')
    expect(pastDue.plus_enabled).toBe(true)
    expect(await overrideRows(t)).toEqual([true])

    await withTenantContext(t, (tx) =>
      onPaymentApproved(t, 'mp-evt-ok-1', 'subscription_authorized_payment', {}, NOW, tx),
    )
    const recovered = await plusRow(t)
    expect(recovered.status).toBe('active')
    expect(recovered.plus_enabled).toBe(true)
    expect(await overrideRows(t)).toEqual([true])
    // La mora no toca el monto de MP: ninguna llamada extra al débito.
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
  })
})

// ─── Lectura ─────────────────────────────────────────────────────────────────

describe('estado de Plus para el panel y la facturación', () => {
  it('getPlusAdminState recorre off, billed, ending y manual_override', async () => {
    const t = await seed(getSql(), 'active')
    expect((await getPlusAdminState(t)).kind).toBe('off')

    await enable(t, 1_200_000)
    const billed = await getPlusAdminState(t)
    expect(billed.kind).toBe('billed')
    expect(billed.pricePerCourtCents).toBe(1_200_000)
    expect(billed.flagOn).toBe(true)

    await disable(t)
    const ending = await getPlusAdminState(t)
    expect(ending.kind).toBe('ending')
    expect(ending.accessUntil).not.toBeNull()

    const manual = await seed(getSql(), 'active')
    await setOverrideBySql(manual, true)
    expect((await getPlusAdminState(manual)).kind).toBe('manual_override')
  })

  it('sin suscripción: getBotFlagOn lee el override real (super-admin no dice "Apagado")', async () => {
    const t = (await createTestTenant(getSql())).id
    expect(await getBotFlagOn(t)).toBe(false)

    await setOverrideBySql(t, true)
    expect(await getBotFlagOn(t)).toBe(true)
  })

  it('getSubscriptionState expone Plus (enabled, precio efectivo, acceso, cotización)', async () => {
    const t = await seed(getSql(), 'active', { plusEnabled: true, plusPrice: 1_200_000 })

    const state = await withTenantContext(t, (tx) => getSubscriptionState(t, tx))

    expect(state!.plus).toEqual({
      enabled: true,
      perCourtCents: 1_200_000,
      accessUntil: null,
      quote: null,
    })
  })
})
