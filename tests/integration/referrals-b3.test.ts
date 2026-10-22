import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

/**
 * Premio de referidos (B3) contra Postgres real: detección en el primer cobro
 * (webhook y reconcile), tope, aprobación, cierre a mano y rechazo.
 * Reglas: docs/decisions/2026-09-26-referidos.md y 2026-10-22-referidos-metodo-manual-premio.md.
 */

/** Estado que devuelve "MP" al reconcile en cada test. */
let estadoRemoto: GatewaySubscriptionState | null = null
let pagosDelComplejo: Array<Record<string, unknown>> = []
/** Si está seteado, el audit `referral.reward_earned` tira (caso 5). */
const fallas = vi.hoisted(() => ({ auditEarned: false }))

vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({
    getSubscriptionState: async () => estadoRemoto,
    searchPaymentsByReference: async () => pagosDelComplejo,
  }),
}))

// Passthrough salvo cuando el caso 5 pide romper SOLO el audit del premio: el
// resto de los audits (transiciones del FSM, extensión de prueba) siguen reales.
vi.mock('@/shared/db/audit', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/shared/db/audit')>()
  return {
    ...real,
    insertSystemAuditLog: (...args: Parameters<typeof real.insertSystemAuditLog>) => {
      if (fallas.auditEarned && args[1].action === 'referral.reward_earned') {
        return Promise.reject(new Error('boom: audit de referidos'))
      }
      return real.insertSystemAuditLog(...args)
    },
  }
})

import { onPaymentApproved } from '@/modules/billing/dunning.service'
import { reconcileSubscriptions } from '@/shared/jobs/workers/reconcile-subscriptions.worker'
import { forceTenantStatus, reactivateTenant } from '@/modules/super-admin/support.service'
import { REFERRAL_REWARD_CAP } from '@/shared/constants'
import {
  approveReferralReward,
  listReferralRewardsForReview,
  markReferralRewardApplied,
  rejectReferralReward,
} from '@/modules/referrals/referral-reward.service'

const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa'
const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-22T12:00:00.000Z')
const PREAPPROVAL = '275616150bef48aa85d502d9b490a359'
const PROXIMO_COBRO = new Date('2026-11-22T14:47:30.000Z')
const COBRO = new Date('2026-10-20T14:49:04.486Z')

let planId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
  `
  planId = rows[0]!.id
}, 30_000)

afterEach(async () => {
  estadoRemoto = null
  pagosDelComplejo = []
  fallas.auditEarned = false
  await cleanupAll(getSql())
})

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SeedOpts = {
  status?: 'trialing' | 'active' | 'past_due' | 'blocked' | 'canceled' | 'churned'
  mpSubscriptionId?: string | null
  trialEndsAt?: Date | null
  referredBy?: string | null
  reward?: 'earned' | 'manual_pending' | 'applied' | 'rejected' | 'over_cap' | null
  withSubscription?: boolean
}

/** Tenant con (opcionalmente) suscripción, referidor y estado de premio. */
async function seedTenant(sql: Sql, opts: SeedOpts = {}): Promise<string> {
  const status = opts.status ?? 'trialing'
  const tenant = await createTestTenant(sql)
  const trialEnds = opts.trialEndsAt === undefined ? null : opts.trialEndsAt
  await sql`
    UPDATE tenants
    SET status = ${status}::tenant_status,
        trial_ends_at = ${trialEnds ? trialEnds.toISOString() : null}::timestamptz,
        referred_by_tenant_id = ${opts.referredBy ?? null},
        referral_reward_status = ${opts.reward ?? null},
        referral_reward_at = ${opts.reward ? '2026-10-21T00:00:00Z' : null}::timestamptz
    WHERE id = ${tenant.id}
  `
  if (opts.withSubscription !== false) {
    // `transitionTrialingToActive` y compañía validan contra el estado de la
    // suscripción, que acompaña al del tenant (blocked/canceled/churned existen
    // también como subscription_status).
    await sql`
      INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, billing_cycle, billed_courts, status,
        current_period_start, current_period_end, mp_subscription_id
      ) VALUES (
        ${tenant.id}, ${planId}, 'monthly'::billing_cycle, 1, ${status}::subscription_status,
        ${'2026-08-01T00:00:00Z'}::timestamptz, ${'2026-09-18T00:00:00Z'}::timestamptz,
        ${opts.mpSubscriptionId === undefined ? null : opts.mpSubscriptionId}
      )
    `
  }
  return tenant.id
}

/** Un referido que ya llegó referido por `referrerId` y todavía no pagó. */
function seedReferred(sql: Sql, referrerId: string, opts: SeedOpts = {}): Promise<string> {
  return seedTenant(sql, {
    ...opts,
    referredBy: referrerId,
    mpSubscriptionId: opts.mpSubscriptionId ?? PREAPPROVAL,
  })
}

/** El cobro tal como lo aplica el webhook: `onPaymentApproved` con clave por cobro. */
async function cobrar(tenantId: string, paymentId: string, preapprovalId = PREAPPROVAL) {
  return withTenantContext(tenantId, (tx) =>
    onPaymentApproved(
      tenantId,
      `evt-${paymentId}-${crypto.randomUUID()}`,
      'subscription_authorized_payment',
      { test: true },
      COBRO,
      tx,
      paymentId,
      preapprovalId,
      `sub-charge:${paymentId}`,
    ),
  )
}

type RewardRow = {
  referral_reward_status: string | null
  referral_reward_at: Date | null
  status: string
  trial_ends_at: Date | null
}

async function readTenant(sql: Sql, tenantId: string): Promise<RewardRow> {
  const rows = await sql<RewardRow[]>`
    SELECT referral_reward_status, referral_reward_at, status, trial_ends_at
    FROM tenants WHERE id = ${tenantId}
  `
  return rows[0]!
}

async function audits(sql: Sql, tenantId: string, action: string) {
  return sql<{ metadata: Record<string, unknown> | null }[]>`
    SELECT metadata FROM audit_logs WHERE tenant_id = ${tenantId} AND action = ${action}
  `
}

async function periodEnd(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ current_period_end: Date; status: string }[]>`
    SELECT current_period_end, status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return new Date(rows[0]!.current_period_end).toISOString()
}

function estadoAuthorizedConUnCobro(tenantId: string): GatewaySubscriptionState {
  return {
    preapprovalId: PREAPPROVAL,
    status: 'authorized',
    externalReference: tenantId,
    nextPaymentDate: PROXIMO_COBRO,
    chargedQuantity: 1,
    lastChargedDate: COBRO,
    lastChargedAmountCents: 10_000,
  }
}

// ─── 1-5: detección ──────────────────────────────────────────────────────────

describe('markReferralRewardEarned — detección del primer cobro (R3)', () => {
  it('1. el primer cobro vía onPaymentApproved deja earned + audit; el segundo no cambia nada', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const referred = await seedReferred(sql, referrer)

    const first = await cobrar(referred, 'pay-1')
    expect(first.alreadyProcessed).toBe(false)

    const row = await readTenant(sql, referred)
    expect(row.status).toBe('active')
    expect(row.referral_reward_status).toBe('earned')
    expect(row.referral_reward_at).not.toBeNull()
    const earnedAudits = await audits(sql, referred, 'referral.reward_earned')
    expect(earnedAudits).toHaveLength(1)
    expect(earnedAudits[0]!.metadata).toMatchObject({
      referrerTenantId: referrer,
      status: 'earned',
    })

    // Segundo cobro (renovación): el premio es del primero.
    await cobrar(referred, 'pay-2')
    const after = await readTenant(sql, referred)
    expect(after.referral_reward_status).toBe('earned')
    expect(new Date(after.referral_reward_at!).toISOString()).toBe(
      new Date(row.referral_reward_at!).toISOString(),
    )
    expect(await audits(sql, referred, 'referral.reward_earned')).toHaveLength(1)
  })

  it('2. el mismo cobro por reconcile y por webhook (misma clave sub-charge) → un solo premio', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const referred = await seedReferred(sql, referrer)
    estadoRemoto = estadoAuthorizedConUnCobro(referred)
    pagosDelComplejo = [{ mpPaymentId: 'pay-dup', status: 'approved', preapprovalId: PREAPPROVAL }]

    const fixed = await reconcileSubscriptions()
    expect(fixed).toBe(1)
    expect((await readTenant(sql, referred)).referral_reward_status).toBe('earned')

    // El webhook llega tarde con el MISMO cobro: la clave ya está reclamada.
    const late = await cobrar(referred, 'pay-dup')
    expect(late.alreadyProcessed).toBe(true)

    expect((await readTenant(sql, referred)).referral_reward_status).toBe('earned')
    expect(await audits(sql, referred, 'referral.reward_earned')).toHaveLength(1)
  })

  it('2b. al revés: el webhook aplica primero y el reconcile (aunque vea trialing) no repite', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const referred = await seedReferred(sql, referrer)
    await cobrar(referred, 'pay-dup2')
    // Simula que el webhook ya había dejado la clave pero la suscripción
    // quedó en trialing (el caso real del 2026-08-20): el reconcile la ve.
    await sql`UPDATE tenant_subscriptions SET status = 'trialing' WHERE tenant_id = ${referred}`
    await sql`UPDATE tenants SET status = 'trialing' WHERE id = ${referred}`
    estadoRemoto = estadoAuthorizedConUnCobro(referred)
    pagosDelComplejo = [{ mpPaymentId: 'pay-dup2', status: 'approved', preapprovalId: PREAPPROVAL }]

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(0)
    expect(await audits(sql, referred, 'referral.reward_earned')).toHaveLength(1)
  })

  it('3. soporte forzando active o reactivando NO marca premio', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const viaForce = await seedReferred(sql, referrer, { status: 'trialing' })
    const viaReactivate = await seedReferred(sql, referrer, { status: 'blocked' })

    await forceTenantStatus(viaForce, 'active', ADMIN_ID, NOW)
    await reactivateTenant(viaReactivate, ADMIN_ID, NOW)

    for (const id of [viaForce, viaReactivate]) {
      const row = await readTenant(sql, id)
      expect(row.status).toBe('active')
      expect(row.referral_reward_status).toBeNull()
      expect(await audits(sql, id, 'referral.reward_earned')).toHaveLength(0)
    }
  })

  it('4. complejo sin referidor: el cobro se aplica y el premio sigue NULL', async () => {
    const sql = getSql()
    const solo = await seedTenant(sql, { status: 'trialing', mpSubscriptionId: PREAPPROVAL })

    await cobrar(solo, 'pay-solo')

    const row = await readTenant(sql, solo)
    expect(row.status).toBe('active')
    expect(row.referral_reward_status).toBeNull()
    expect(await audits(sql, solo, 'referral.reward_earned')).toHaveLength(0)
  })

  it('5. un error en referidos NO frena el cobro (savepoint)', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const referred = await seedReferred(sql, referrer)
    fallas.auditEarned = true

    const result = await cobrar(referred, 'pay-boom')

    expect(result.alreadyProcessed).toBe(false)
    const row = await readTenant(sql, referred)
    expect(row.status).toBe('active')
    expect(new Date(await periodEnd(sql, referred)).getTime()).toBeGreaterThan(COBRO.getTime())
    // El UPDATE del premio estaba en el savepoint que se revirtió.
    expect(row.referral_reward_status).toBeNull()
    expect(await audits(sql, referred, 'referral.reward_earned')).toHaveLength(0)
    // El cobro sí dejó su rastro de FSM.
    const sub = await sql<{ last_payment_at: Date | null }[]>`
      SELECT last_payment_at FROM tenant_subscriptions WHERE tenant_id = ${referred}
    `
    expect(sub[0]!.last_payment_at).not.toBeNull()
  })
})

// ─── 6: tope ─────────────────────────────────────────────────────────────────

describe('markReferralRewardEarned — tope de R1', () => {
  it('6. con 6 contados el 7mo queda over_cap; uno rejected no cuenta', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const counted = [
      'earned',
      'manual_pending',
      'applied',
      'earned',
      'applied',
      'manual_pending',
    ] as const
    expect(counted).toHaveLength(REFERRAL_REWARD_CAP)
    for (const reward of counted) await seedReferred(sql, referrer, { status: 'active', reward })
    const seventh = await seedReferred(sql, referrer)

    await cobrar(seventh, 'pay-7')

    const row = await readTenant(sql, seventh)
    expect(row.referral_reward_status).toBe('over_cap')
    const a = await audits(sql, seventh, 'referral.reward_earned')
    expect(a).toHaveLength(1)
    expect(a[0]!.metadata).toMatchObject({ status: 'over_cap' })
  })

  it('6b. 5 contados + 1 rejected + over_cap previo: el que paga queda earned', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    for (const reward of [
      'earned',
      'applied',
      'applied',
      'manual_pending',
      'earned',
      'rejected',
      'over_cap',
    ] as const) {
      await seedReferred(sql, referrer, { status: 'active', reward })
    }
    const next = await seedReferred(sql, referrer)

    await cobrar(next, 'pay-6th')

    expect((await readTenant(sql, next)).referral_reward_status).toBe('earned')
  })

  it('6c. dos cobros simultáneos con 5 contados: uno earned y uno over_cap (advisory lock)', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    for (let i = 0; i < REFERRAL_REWARD_CAP - 1; i += 1) {
      await seedReferred(sql, referrer, { status: 'active', reward: 'applied' })
    }
    const a = await seedReferred(sql, referrer, { mpSubscriptionId: 'pre-a' })
    const b = await seedReferred(sql, referrer, { mpSubscriptionId: 'pre-b' })

    await Promise.all([cobrar(a, 'pay-a', 'pre-a'), cobrar(b, 'pay-b', 'pre-b')])

    const statuses = [
      (await readTenant(sql, a)).referral_reward_status,
      (await readTenant(sql, b)).referral_reward_status,
    ].sort()
    expect(statuses).toEqual(['earned', 'over_cap'])
  })
})

// ─── 7-10: aprobación ────────────────────────────────────────────────────────

describe('approveReferralReward', () => {
  it('7. referidor trialing sin preapproval → trial_extended, max(now, fin)+30d, audit; la 2da es already_processed', async () => {
    const sql = getSql()
    const finActual = new Date(NOW.getTime() + 10 * DAY_MS)
    const referrer = await seedTenant(sql, {
      status: 'trialing',
      trialEndsAt: finActual,
      withSubscription: false,
    })
    const referred = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })
    const gateway = new MockGateway()

    const first = await approveReferralReward(referred, ADMIN_ID, gateway, NOW)
    const expected = new Date(finActual.getTime() + 30 * DAY_MS)
    expect(first).toEqual({ ok: true, applied: 'trial_extended', trialEndsAt: expected })
    expect((await readTenant(sql, referred)).referral_reward_status).toBe('applied')
    expect(new Date((await readTenant(sql, referrer)).trial_ends_at!).toISOString()).toBe(
      expected.toISOString(),
    )
    const applied = await audits(sql, referrer, 'referral.reward_applied')
    expect(applied).toHaveLength(1)
    expect(applied[0]!.metadata).toMatchObject({
      referredTenantId: referred,
      method: 'trial_extended',
      days: 30,
    })

    const second = await approveReferralReward(referred, ADMIN_ID, gateway, NOW)
    expect(second).toEqual({ ok: false, reason: 'already_processed' })
    expect(new Date((await readTenant(sql, referrer)).trial_ends_at!).toISOString()).toBe(
      expected.toISOString(),
    )
  })

  it('7b. prueba ya vencida: la base es now, no el fin viejo', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, {
      status: 'trialing',
      trialEndsAt: new Date(NOW.getTime() - 3 * DAY_MS),
      withSubscription: false,
    })
    const referred = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })

    const res = await approveReferralReward(referred, ADMIN_ID, new MockGateway(), NOW)

    expect(res).toEqual({
      ok: true,
      applied: 'trial_extended',
      trialEndsAt: new Date(NOW.getTime() + 30 * DAY_MS),
    })
  })

  it('7c. dos aprobaciones concurrentes: una aplica, la otra already_processed, +30d UNA vez', async () => {
    const sql = getSql()
    const finActual = new Date(NOW.getTime() + 5 * DAY_MS)
    const referrer = await seedTenant(sql, {
      status: 'trialing',
      trialEndsAt: finActual,
      withSubscription: false,
    })
    const referred = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })
    const gateway = new MockGateway()

    const results = await Promise.all([
      approveReferralReward(referred, ADMIN_ID, gateway, NOW),
      approveReferralReward(referred, ADMIN_ID, gateway, NOW),
    ])

    const oks = results.filter((r) => r.ok)
    const dup = results.filter((r) => !r.ok)
    expect(oks).toHaveLength(1)
    expect(dup).toEqual([{ ok: false, reason: 'already_processed' }])
    expect(new Date((await readTenant(sql, referrer)).trial_ends_at!).toISOString()).toBe(
      new Date(finActual.getTime() + 30 * DAY_MS).toISOString(),
    )
    expect(await audits(sql, referrer, 'referral.reward_applied')).toHaveLength(1)
  })

  it('8. trialing con checkout pending sin cobros → trial_extended; con preapproval authorized → manual_pending', async () => {
    const sql = getSql()
    const finActual = new Date(NOW.getTime() + 10 * DAY_MS)

    // Checkout que nunca se pagó (El Vagón).
    const pendingReferrer = await seedTenant(sql, {
      status: 'trialing',
      trialEndsAt: finActual,
      mpSubscriptionId: 'pre-pending',
    })
    const pendingReferred = await seedReferred(sql, pendingReferrer, {
      reward: 'earned',
      status: 'active',
    })
    const pendingGw = new MockGateway()
    pendingGw.subscriptionState = {
      preapprovalId: 'pre-pending',
      status: 'pending',
      externalReference: pendingReferrer,
      nextPaymentDate: null,
      chargedQuantity: 0,
      lastChargedDate: null,
      lastChargedAmountCents: null,
    }
    const r1 = await approveReferralReward(pendingReferred, ADMIN_ID, pendingGw, NOW)
    expect(r1).toMatchObject({ ok: true, applied: 'trial_extended' })
    expect(pendingGw.getSubscriptionStateCalls).toEqual(['pre-pending'])
    const a1 = await audits(sql, pendingReferrer, 'referral.reward_applied')
    expect(a1[0]!.metadata).toMatchObject({ leftPendingMpSubscriptionId: 'pre-pending' })

    // Débito vivo: autorizado.
    const liveReferrer = await seedTenant(sql, {
      status: 'trialing',
      trialEndsAt: finActual,
      mpSubscriptionId: 'pre-live',
    })
    const liveReferred = await seedReferred(sql, liveReferrer, {
      reward: 'earned',
      status: 'active',
    })
    const liveGw = new MockGateway()
    liveGw.subscriptionState = {
      preapprovalId: 'pre-live',
      status: 'authorized',
      externalReference: liveReferrer,
      nextPaymentDate: PROXIMO_COBRO,
      chargedQuantity: 0,
      lastChargedDate: null,
      lastChargedAmountCents: null,
    }
    const r2 = await approveReferralReward(liveReferred, ADMIN_ID, liveGw, NOW)
    expect(r2).toEqual({ ok: true, applied: 'manual_pending' })
    expect((await readTenant(sql, liveReferred)).referral_reward_status).toBe('manual_pending')
    expect(new Date((await readTenant(sql, liveReferrer)).trial_ends_at!).toISOString()).toBe(
      finActual.toISOString(),
    )
    expect(await audits(sql, liveReferrer, 'referral.reward_approved')).toHaveLength(1)
  })

  it('8b. MP no responde (estado null) con preapproval guardado → manual_pending, sin tocar la prueba', async () => {
    const sql = getSql()
    const finActual = new Date(NOW.getTime() + 10 * DAY_MS)
    const referrer = await seedTenant(sql, {
      status: 'trialing',
      trialEndsAt: finActual,
      mpSubscriptionId: 'pre-x',
    })
    const referred = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })

    const res = await approveReferralReward(referred, ADMIN_ID, new MockGateway(), NOW)

    expect(res).toEqual({ ok: true, applied: 'manual_pending' })
    expect(new Date((await readTenant(sql, referrer)).trial_ends_at!).toISOString()).toBe(
      finActual.toISOString(),
    )
  })

  it('9. referidor active → manual_pending; "Ya lo apliqué" → applied; repetido → already_processed', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active', mpSubscriptionId: 'pre-act' })
    const referred = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })

    const approved = await approveReferralReward(referred, ADMIN_ID, new MockGateway(), NOW)
    expect(approved).toEqual({ ok: true, applied: 'manual_pending' })
    expect((await readTenant(sql, referred)).referral_reward_status).toBe('manual_pending')

    expect(await markReferralRewardApplied(referred, ADMIN_ID)).toEqual({ ok: true })
    expect((await readTenant(sql, referred)).referral_reward_status).toBe('applied')
    expect(await audits(sql, referrer, 'referral.reward_applied')).toHaveLength(1)

    expect(await markReferralRewardApplied(referred, ADMIN_ID)).toEqual({
      ok: false,
      reason: 'already_processed',
    })
    expect(await audits(sql, referrer, 'referral.reward_applied')).toHaveLength(1)
  })

  it('9b. aprobar un premio que no está earned → already_processed; id inexistente → not_found', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const pending = await seedReferred(sql, referrer, {
      reward: 'manual_pending',
      status: 'active',
    })
    const gw = new MockGateway()

    expect(await approveReferralReward(pending, ADMIN_ID, gw, NOW)).toEqual({
      ok: false,
      reason: 'already_processed',
    })
    expect(await approveReferralReward(crypto.randomUUID(), ADMIN_ID, gw, NOW)).toEqual({
      ok: false,
      reason: 'not_found',
    })
    // markReferralRewardApplied sobre un earned (no manual_pending) tampoco aplica.
    const earned = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })
    expect(await markReferralRewardApplied(earned, ADMIN_ID)).toEqual({
      ok: false,
      reason: 'already_processed',
    })
  })

  it.each(['canceled', 'churned'] as const)(
    '10. referidor %s → referrer_inactive y el premio queda earned',
    async (status) => {
      const sql = getSql()
      const referrer = await seedTenant(sql, { status })
      const referred = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })

      const res = await approveReferralReward(referred, ADMIN_ID, new MockGateway(), NOW)

      expect(res).toEqual({ ok: false, reason: 'referrer_inactive' })
      expect((await readTenant(sql, referred)).referral_reward_status).toBe('earned')
      expect(await audits(sql, referrer, 'referral.reward_applied')).toHaveLength(0)
    },
  )
})

// ─── 11-12: rechazo y lista ──────────────────────────────────────────────────

describe('rejectReferralReward', () => {
  it('11. earned y manual_pending → rejected (audit en el referido); applied → already_processed', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const earned = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })
    const pending = await seedReferred(sql, referrer, {
      reward: 'manual_pending',
      status: 'active',
    })
    const applied = await seedReferred(sql, referrer, { reward: 'applied', status: 'active' })

    expect(await rejectReferralReward(earned, ADMIN_ID)).toEqual({ ok: true })
    expect(await rejectReferralReward(pending, ADMIN_ID)).toEqual({ ok: true })
    expect(await rejectReferralReward(applied, ADMIN_ID)).toEqual({
      ok: false,
      reason: 'already_processed',
    })
    expect(await rejectReferralReward(crypto.randomUUID(), ADMIN_ID)).toEqual({
      ok: false,
      reason: 'not_found',
    })

    expect((await readTenant(sql, earned)).referral_reward_status).toBe('rejected')
    expect((await readTenant(sql, pending)).referral_reward_status).toBe('rejected')
    expect((await readTenant(sql, applied)).referral_reward_status).toBe('applied')
    const a = await audits(sql, pending, 'referral.reward_rejected')
    expect(a).toHaveLength(1)
    expect(a[0]!.metadata).toMatchObject({
      referrerTenantId: referrer,
      previousStatus: 'manual_pending',
    })
    expect(await audits(sql, applied, 'referral.reward_rejected')).toHaveLength(0)
  })
})

describe('listReferralRewardsForReview', () => {
  it('12. devuelve solo earned/manual_pending, con exactamente las claves del tipo', async () => {
    const sql = getSql()
    const referrer = await seedTenant(sql, { status: 'active' })
    const earned = await seedReferred(sql, referrer, { reward: 'earned', status: 'active' })
    const pending = await seedReferred(sql, referrer, {
      reward: 'manual_pending',
      status: 'active',
    })
    for (const reward of ['applied', 'rejected', 'over_cap'] as const) {
      await seedReferred(sql, referrer, { reward, status: 'active' })
    }
    await seedReferred(sql, referrer, { status: 'active' })

    const list = await listReferralRewardsForReview()

    expect(list.map((r) => r.referredTenantId).sort()).toEqual([earned, pending].sort())
    const expectedKeys = [
      'referredName',
      'referredTenantId',
      'referrerName',
      'referrerStatus',
      'referrerTenantId',
      'referrerTrialEndsAt',
      'status',
      'statusAt',
    ]
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual(expectedKeys)
      expect(row.referrerTenantId).toBe(referrer)
      expect(row.referrerStatus).toBe('active')
    }
    expect(list.find((r) => r.referredTenantId === pending)!.status).toBe('manual_pending')
    expect(list.find((r) => r.referredTenantId === earned)!.status).toBe('earned')
  })
})
