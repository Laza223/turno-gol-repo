import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, addHours, addMonths, addYears } from 'date-fns'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { clearFeatureFlagCache } from '@/shared/feature-flags'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import { getSubscriptionState } from '@/modules/billing/billing.service'
import { PlusQuoteNotPendingError } from '@/modules/billing/billing.errors'
import {
  applyPlusProratePayment,
  enablePlus,
  ensurePlusFlagOn,
  getPlusAdminState,
  startPlusProratePayment,
  type PlusActor,
} from '@/modules/billing/plus.service'
import { buildSaasPlusRef, type MpPaymentStatus } from '@/modules/payments/payment.types'
import {
  resetEmailProvider,
  setEmailProvider,
  type EmailProvider,
} from '@/modules/notifications/email.provider'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { reconcileSubscriptions } from '@/shared/jobs/workers/reconcile-subscriptions.worker'
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
 * Cobro de TurnoGol Plus, Fase B: acreditar el pago único del alta de Plus en un
 * anual ya pago (P7) y los avisos por mail al dueño de TurnoGol (P11).
 *
 * Montos a mano (plan $30.000 por cancha, Plus de lista $15.000, anual 10% sobre
 * la suma, 5 canchas): un test que recalcula con la fórmula del código no prueba
 * nada. Las fechas salen de un `NOW` inyectado.
 */

const NOW = new Date('2027-03-10T12:00:00Z')
/** 5 meses y 12 días por delante: se cobran 5. */
const PERIOD_END = addDays(addMonths(NOW, 5), 12)
/** Plus especial de prueba: $12.000 por cancha (distinto de la lista, a propósito). */
const SPECIAL_PRICE = 1_200_000
/** 5 meses x $12.000 x 5 canchas x 0,9. */
const QUOTE_CENTS = 27_000_000
/** (150.000 + 5 x 12.000) x 0,9 x 12. */
const ANNUAL_WITH_SPECIAL = 226_800_000
/** (150.000 + 5 x 15.000) x 0,9 x 12. */
const ANNUAL_WITH_LIST = 243_000_000
const PAYMENT = 'mp-pay-100'

type Sent = Parameters<EmailProvider['send']>[0]

let planId: string
let actor: PlusActor
let gateway: MockGateway
let sent: Sent[]

async function loadActivePlanId(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
  `
  const id = rows[0]?.id
  if (!id) throw new Error('no hay plan activo')
  return id
}

/** Complejo anual con débito autorizado. `quote` = pasa por el alta real de Plus (cotiza). */
async function seed(
  opts: { status?: string; cycle?: 'monthly' | 'annual'; quote?: boolean } = {},
): Promise<string> {
  const sql = getSql()
  const tenant = await createTestTenant(sql, { name: 'Complejo Test' })
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const status = opts.status ?? 'active'
  const cycle = opts.cycle ?? 'annual'
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, billed_courts, status,
      current_period_start, current_period_end, mp_subscription_id
    ) VALUES (
      ${tenant.id}, ${planId}, ${cycle}::billing_cycle, 5, 'active'::subscription_status,
      ${addMonths(PERIOD_END, -12).toISOString()}::timestamptz,
      ${PERIOD_END.toISOString()}::timestamptz, ${`mp-preapp-${tenant.id}`}
    )
  `
  if (opts.quote !== false) {
    const res = await enablePlus(
      tenant.id,
      { pricePerCourtCents: SPECIAL_PRICE },
      actor,
      gateway,
      NOW,
    )
    expect(res).toEqual({ kind: 'quote_pending', months: 5, amountCents: QUOTE_CENTS })
    gateway.updatePreapprovalCalls.length = 0
  }
  if (status !== 'active') {
    await sql`UPDATE tenant_subscriptions SET status = ${status}::subscription_status WHERE tenant_id = ${tenant.id}`
  }
  return tenant.id
}

type SubRow = {
  status: string
  plus_enabled: boolean
  plus_price_per_court_cents: number | null
  plus_prorate_cents: number | null
  plus_prorate_months: number | null
  plus_prorate_period_end: Date | null
  plus_prorate_quoted_at: Date | null
  current_period_end: Date
}

async function subRow(tenantId: string): Promise<SubRow> {
  const rows = await getSql()<SubRow[]>`
    SELECT status, plus_enabled, plus_price_per_court_cents, plus_prorate_cents,
           plus_prorate_months, plus_prorate_period_end, plus_prorate_quoted_at,
           current_period_end
    FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return rows[0]!
}

async function overrideRows(tenantId: string): Promise<boolean[]> {
  const rows = await getSql()<{ value: boolean }[]>`
    SELECT value FROM feature_flags WHERE key = ${BOT_FEATURE_FLAG} AND tenant_id = ${tenantId}
  `
  return rows.map((r) => r.value)
}

async function auditCount(tenantId: string, action: string): Promise<number> {
  const rows = await getSql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = ${tenantId} AND action = ${action}
  `
  return rows[0]!.n
}

async function claimedKeys(): Promise<string[]> {
  const rows = await getSql()<{ mp_event_id: string }[]>`
    SELECT mp_event_id FROM processed_webhooks WHERE mp_event_id LIKE 'plus-prorate%' ORDER BY 1
  `
  return rows.map((r) => r.mp_event_id)
}

async function opsKeys(): Promise<string[]> {
  const rows = await getSql()<{ key: string }[]>`SELECT key FROM ops_alerts ORDER BY key`
  return rows.map((r) => r.key)
}

/** Lo que hace el webhook: la acreditación dentro de la tx del tenant. */
function pay(
  tenantId: string,
  over: Partial<{
    id: string
    status: MpPaymentStatus
    amount: number
    dateCreated: string | null
  }> = {},
  gw: MockGateway | null = gateway,
) {
  return withTenantContext(tenantId, (tx) =>
    applyPlusProratePayment(
      {
        tenantId,
        mpPaymentId: over.id ?? PAYMENT,
        status: over.status ?? 'approved',
        amountCents: over.amount ?? QUOTE_CENTS,
        // Por defecto el pago es posterior a la cotización (hecha en NOW).
        dateCreated:
          over.dateCreated === undefined
            ? addHours(NOW, 1).toISOString()
            : (over.dateCreated ?? undefined),
      },
      gw ?? undefined,
      tx,
      NOW,
    ),
  )
}

beforeAll(async () => {
  await ensureRoles(getSql())
  planId = await loadActivePlanId(getSql())
}, 30_000)

afterAll(async () => {
  await closeSql()
})

beforeEach(async () => {
  const sql = getSql()
  await cleanupAll(sql)
  await sql`TRUNCATE TABLE ops_alerts, processed_webhooks, feature_flags`
  clearFeatureFlagCache()
  gateway = new MockGateway()
  setBillingGateway(gateway)
  actor = { type: 'system', id: (await createTestSystemAdmin(sql)).id }
  sent = []
  setEmailProvider({
    send: async (params) => {
      sent.push(params)
    },
  })
}, 30_000)

afterEach(() => {
  setBillingGateway(null)
  resetEmailProvider()
})

describe('acreditación del pago anual (AN2, AN3)', () => {
  it('AN2: acredita: prende Plus, limpia la cotización, sube el débito anual y no toca período ni estado', async () => {
    const t = await seed()
    const before = await subRow(t)

    const res = await pay(t)

    expect(res).toEqual({ enableFlag: true })
    const after = await subRow(t)
    expect(after.plus_enabled).toBe(true)
    expect(after.plus_prorate_cents).toBeNull()
    expect(after.plus_prorate_months).toBeNull()
    expect(after.plus_price_per_court_cents).toBe(SPECIAL_PRICE)
    expect(after.status).toBe('active')
    expect(after.current_period_end).toEqual(before.current_period_end)
    expect(gateway.updatePreapprovalCalls).toEqual([
      {
        preapprovalId: `mp-preapp-${t}`,
        amount: ANNUAL_WITH_SPECIAL,
        reason: 'TurnoGol — 5 canchas + Asistente de WhatsApp (anual)',
      },
    ])
    expect(await auditCount(t, 'plus.prorate_paid')).toBe(1)
    expect(await claimedKeys()).toEqual([`plus-prorate:${PAYMENT}`])
    expect(sent).toHaveLength(0)

    // El flag va después del commit: antes no hay override, después sí.
    expect(await overrideRows(t)).toEqual([])
    await ensurePlusFlagOn(t)
    expect(await overrideRows(t)).toEqual([true])
  })

  it('AN2: sin precio especial el débito anual usa la lista de Plus', async () => {
    const t = await seed({ quote: false })
    // Cotización a precio de lista (price NULL): 5 x 5 x 15.000 x 0,9 = 337.500.
    await enablePlus(t, { pricePerCourtCents: null }, actor, gateway, NOW)
    gateway.updatePreapprovalCalls.length = 0

    await pay(t, { amount: 33_750_000 })

    expect(gateway.updatePreapprovalCalls[0]?.amount).toBe(ANNUAL_WITH_LIST)
  })

  it('AN3: el mismo pago con otro mpEventId (created + updated) acredita UNA vez', async () => {
    const t = await seed()

    const first = await pay(t)
    const second = await pay(t)

    expect(first.enableFlag).toBe(true)
    expect(second.enableFlag).toBe(false)
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect(await auditCount(t, 'plus.prorate_paid')).toBe(1)
  })

  it('AN3: dos notificaciones en Promise.all acreditan UNA vez', async () => {
    const t = await seed()

    const results = await Promise.all([pay(t), pay(t)])

    expect(results.filter((r) => r.enableFlag)).toHaveLength(1)
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect(await auditCount(t, 'plus.prorate_paid')).toBe(1)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(0)
  })

  it('modo mock (gateway undefined): acredita sin tocar MP', async () => {
    const t = await seed()

    const res = await pay(t, {}, null)

    expect(res.enableFlag).toBe(true)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('MP falla al subir el débito: rollback completo (ni Plus, ni reclamo, ni audit) y el reintento acredita', async () => {
    const t = await seed()
    gateway.updatePreapprovalError = new Error('MP caído')

    await expect(pay(t)).rejects.toThrow('MP caído')

    const mid = await subRow(t)
    expect(mid.plus_enabled).toBe(false)
    expect(mid.plus_prorate_cents).toBe(QUOTE_CENTS)
    expect(await claimedKeys()).toEqual([])
    expect(await auditCount(t, 'plus.prorate_paid')).toBe(0)

    gateway.updatePreapprovalError = undefined
    const res = await pay(t)
    expect(res.enableFlag).toBe(true)
    expect((await subRow(t)).plus_enabled).toBe(true)
  })
})

describe('pago que no coincide (AN4, AN7, AN8)', () => {
  it.each([
    ['menor', QUOTE_CENTS - 1],
    ['mayor', QUOTE_CENTS + 1],
    ['desconocido (amount 0)', 0],
  ])('AN4: monto %s: no prende, la cotización queda y avisa por mail', async (_label, amount) => {
    const t = await seed()

    const res = await pay(t, { amount })

    expect(res).toEqual({ enableFlag: false })
    const row = await subRow(t)
    expect(row.plus_enabled).toBe(false)
    expect(row.plus_prorate_cents).toBe(QUOTE_CENTS)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
    expect(await opsKeys()).toEqual([`plus-prorate-unmatched:${PAYMENT}`])
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe('Complejo Test: pago de TurnoGol Plus que no coincide')
    expect(sent[0]?.text).toContain('No se prendió nada')
    expect(sent[0]?.text).toContain('a mano en MercadoPago')
    expect(sent[0]?.text).toContain(`/super-admin/tenants/${t}`)
  })

  it.each<MpPaymentStatus>(['pending', 'in_process', 'rejected', 'cancelled'])(
    'AN4: estado %s: nada (ni reclamo, ni audit, ni mail)',
    async (status) => {
      const t = await seed()

      const res = await pay(t, { status })

      expect(res).toEqual({ enableFlag: false })
      expect((await subRow(t)).plus_prorate_cents).toBe(QUOTE_CENTS)
      expect(await claimedKeys()).toEqual([])
      expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(0)
      expect(sent).toHaveLength(0)
    },
  )

  it('AN4: pending y después approved del mismo pago sí acredita (el pending no reclama la clave)', async () => {
    const t = await seed()
    await pay(t, { status: 'pending' })

    const res = await pay(t)

    expect(res.enableFlag).toBe(true)
  })

  it('AN7: sin cotización pendiente (vieja o descartada) no prende y avisa', async () => {
    const t = await seed({ quote: false })

    const res = await pay(t)

    expect(res.enableFlag).toBe(false)
    expect((await subRow(t)).plus_enabled).toBe(false)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
    expect(sent[0]?.text).toContain('ninguna cotización pendiente')
  })

  it.each(['canceled', 'blocked'])(
    'AN7: complejo %s al acreditarse: no prende, la cotización queda y avisa',
    async (status) => {
      const t = await seed({ status })

      const res = await pay(t)

      expect(res.enableFlag).toBe(false)
      const row = await subRow(t)
      expect(row.plus_enabled).toBe(false)
      expect(row.plus_prorate_cents).toBe(QUOTE_CENTS)
      expect(gateway.updatePreapprovalCalls).toHaveLength(0)
      expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
      expect(sent).toHaveLength(1)
    },
  )

  it('AN7: complejo que ya no es anual: no prende y avisa', async () => {
    const t = await seed()
    await getSql()`UPDATE tenant_subscriptions SET billing_cycle = 'monthly' WHERE tenant_id = ${t}`

    const res = await pay(t)

    expect(res.enableFlag).toBe(false)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
  })

  it('AN8: un segundo pago distinto con la cotización ya consumida es alerta de duplicado, no otro "prender"', async () => {
    const t = await seed()
    await pay(t, { id: 'mp-pay-A' })

    const res = await pay(t, { id: 'mp-pay-B' })

    expect(res.enableFlag).toBe(false)
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect(await auditCount(t, 'plus.prorate_paid')).toBe(1)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
    expect(await opsKeys()).toEqual(['plus-prorate-unmatched:mp-pay-B'])
  })
})

describe('devolución y contracargo (P11)', () => {
  it.each<MpPaymentStatus>(['refunded', 'charged_back'])(
    '%s: avisa y NO apaga Plus; la segunda notificación no repite',
    async (status) => {
      const t = await seed()
      await pay(t)
      sent.length = 0

      const res = await pay(t, { status })
      await pay(t, { status })

      expect(res).toEqual({ enableFlag: false })
      expect((await subRow(t)).plus_enabled).toBe(true)
      expect(await auditCount(t, 'plus.prorate_payment_reversed')).toBe(1)
      expect(await opsKeys()).toEqual([`plus-prorate-refund:${PAYMENT}:${status}`])
      expect(sent).toHaveLength(1)
      expect(sent[0]?.subject).toBe(
        'Complejo Test: devolución/contracargo del pago de TurnoGol Plus',
      )
      expect(sent[0]?.text).toContain('Plus sigue prendido')
    },
  )
})

describe('mails: dedupe y reintento', () => {
  it('sin super admins activos el camino tira, rollbackea el reclamo y el reintento manda', async () => {
    const t = await seed()
    await getSql()`UPDATE system_admins SET status = 'inactive'`

    await expect(pay(t, { amount: 1 })).rejects.toThrow(/ops mail not delivered/)

    expect(await claimedKeys()).toEqual([])
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(0)
    expect(sent).toHaveLength(0)

    await getSql()`UPDATE system_admins SET status = 'active'`
    await pay(t, { amount: 1 })
    expect(sent).toHaveLength(1)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
  })

  it('una clave ya reclamada en ops_alerts cuenta como entregada: no repite el mail ni tira', async () => {
    const t = await seed()
    await getSql()`INSERT INTO ops_alerts (key) VALUES (${`plus-prorate-unmatched:${PAYMENT}`})`

    await expect(pay(t, { amount: 1 })).resolves.toEqual({ enableFlag: false })

    expect(sent).toHaveLength(0)
  })
})

describe('rescate (worker) y webhook sobre el mismo pago', () => {
  function seedSearch(
    t: string,
    status: MpPaymentStatus = 'approved',
    amount = QUOTE_CENTS,
    dateCreated?: string,
  ) {
    gateway.searchResults[buildSaasPlusRef(t)] = [
      {
        mpPaymentId: PAYMENT,
        status,
        amount,
        externalReference: buildSaasPlusRef(t),
        paymentMethodId: 'account_money',
        dateCreated: dateCreated ?? addHours(NOW, 1).toISOString(),
      },
    ]
  }

  it('el rescate acredita el pago aprobado y prende el flag; el webhook tardío no acredita otra vez', async () => {
    const t = await seed()
    seedSearch(t)

    await reconcileSubscriptions()

    expect((await subRow(t)).plus_enabled).toBe(true)
    expect(await overrideRows(t)).toEqual([true])
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)

    const late = await pay(t)
    expect(late.enableFlag).toBe(false)
    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect(await auditCount(t, 'plus.prorate_paid')).toBe(1)
  })

  it('si el webhook ya acreditó, el siguiente tick del rescate no hace nada (la cotización ya no está)', async () => {
    const t = await seed()
    await pay(t)
    seedSearch(t)

    await reconcileSubscriptions()
    await reconcileSubscriptions()

    expect(gateway.updatePreapprovalCalls).toHaveLength(1)
    expect(await auditCount(t, 'plus.prorate_paid')).toBe(1)
  })

  it('el rescate ignora pagos que no están aprobados', async () => {
    const t = await seed()
    seedSearch(t, 'pending')

    await reconcileSubscriptions()

    expect((await subRow(t)).plus_enabled).toBe(false)
    expect(await claimedKeys()).toEqual([])
  })

  it('el rescate con un pago de otro monto no prende y avisa una sola vez entre ticks', async () => {
    const t = await seed()
    seedSearch(t, 'approved', QUOTE_CENTS - 100)

    await reconcileSubscriptions()
    await reconcileSubscriptions()

    expect((await subRow(t)).plus_enabled).toBe(false)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
    expect(sent).toHaveLength(1)
  })
})

describe('drift del débito con Plus (mail)', () => {
  async function activeWithDebit(plusEnabled: boolean): Promise<string> {
    const sql = getSql()
    const tenant = await createTestTenant(sql, { name: 'Complejo Drift' })
    await sql`
      INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, billing_cycle, billed_courts, status,
        current_period_start, current_period_end, mp_subscription_id, plus_enabled
      ) VALUES (
        ${tenant.id}, ${planId}, 'monthly'::billing_cycle, 5, 'active'::subscription_status,
        ${addMonths(NOW, -1).toISOString()}::timestamptz, ${addDays(NOW, 20).toISOString()}::timestamptz,
        ${`mp-preapp-${tenant.id}`}, ${plusEnabled}
      )
    `
    gateway.subscriptionState = {
      preapprovalId: `mp-preapp-${tenant.id}`,
      status: 'authorized',
      externalReference: tenant.id,
      nextPaymentDate: addDays(NOW, 20),
      chargedQuantity: 1,
      lastChargedDate: addMonths(NOW, -1),
      lastChargedAmountCents: 15_000_000,
      // Solo el plan: el débito no refleja Plus (o el plan sin Plus no coincide con la baja de precio).
      amountCents: 10_000_000,
    }
    return tenant.id
  }

  it('con Plus prendido: avisa por mail con monto esperado y monto en MP', async () => {
    const t = await activeWithDebit(true)

    await reconcileSubscriptions()

    expect(await auditCount(t, 'subscription.amount_drift')).toBe(1)
    const keys = await opsKeys()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(new RegExp(`^plus-amount-drift:${t}:\\d{4}-\\d{2}-\\d{2}T\\d{2}$`))
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe(
      'Complejo Drift: el débito de MercadoPago no refleja TurnoGol Plus',
    )
    expect(sent[0]?.text).toContain('225.000')
    expect(sent[0]?.text).toContain('100.000')
  })

  it('sin Plus: el drift sigue igual que hoy, sin mail', async () => {
    const t = await activeWithDebit(false)

    await reconcileSubscriptions()

    expect(await auditCount(t, 'subscription.amount_drift')).toBe(1)
    expect(sent).toHaveLength(0)
    expect(await opsKeys()).toEqual([])
  })

  it('si el mail no sale no se escribe el audit y el próximo tick reintenta', async () => {
    const t = await activeWithDebit(true)
    await getSql()`UPDATE system_admins SET status = 'inactive'`

    await reconcileSubscriptions()
    expect(await auditCount(t, 'subscription.amount_drift')).toBe(0)

    await getSql()`UPDATE system_admins SET status = 'active'`
    await reconcileSubscriptions()
    expect(await auditCount(t, 'subscription.amount_drift')).toBe(1)
    expect(sent).toHaveLength(1)
  })
})

describe('la cotización está atada a su período y a su momento (F2, F3)', () => {
  /** El año renovó: mismo complejo, `current_period_end` un año más adelante. */
  async function renew(t: string): Promise<Date> {
    const newEnd = addMonths(PERIOD_END, 12)
    await getSql()`
      UPDATE tenant_subscriptions
      SET current_period_start = ${PERIOD_END.toISOString()}::timestamptz,
          current_period_end = ${newEnd.toISOString()}::timestamptz
      WHERE tenant_id = ${t}
    `
    return newEnd
  }

  it('enablePlus guarda contra qué período y cuándo cotizó', async () => {
    const t = await seed()

    const row = await subRow(t)
    expect(new Date(row.plus_prorate_period_end!)).toEqual(PERIOD_END)
    expect(new Date(row.plus_prorate_quoted_at!)).toEqual(NOW)
  })

  it('F2: tras la renovación la cotización de 5 meses venció: sin botón, sin link y un pago por el monto viejo no prende y avisa', async () => {
    const t = await seed()
    await renew(t)

    const state = await withTenantContext(t, (tx) => getSubscriptionState(t, tx))
    expect(state.plus.quote).toBeNull()
    expect((await getPlusAdminState(t)).kind).toBe('off')
    await expect(startPlusProratePayment(t, gateway, addMonths(NOW, 8))).rejects.toBeInstanceOf(
      PlusQuoteNotPendingError,
    )
    expect(gateway.plusPreferenceCalls).toHaveLength(0)

    const res = await pay(t)

    expect(res).toEqual({ enableFlag: false })
    expect((await subRow(t)).plus_enabled).toBe(false)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain('cotización vencida')
  })

  it('F2: volver a prender después de la renovación recotiza contra el período nuevo', async () => {
    const t = await seed()
    const newEnd = await renew(t)
    const later = addMonths(PERIOD_END, 1)

    const res = await enablePlus(t, { pricePerCourtCents: SPECIAL_PRICE }, actor, gateway, later)

    // 11 meses completos hasta newEnd x (5 x $12.000 x 0,9 = $54.000)
    expect(res).toEqual({ kind: 'quote_pending', months: 11, amountCents: 59_400_000 })
    const row = await subRow(t)
    expect(new Date(row.plus_prorate_period_end!)).toEqual(newEnd)
    expect(new Date(row.plus_prorate_quoted_at!)).toEqual(later)
    expect(await auditCount(t, 'plus.quote_created')).toBe(2)
    const state = await withTenantContext(t, (tx) => getSubscriptionState(t, tx))
    expect(state.plus.quote).toEqual({ months: 11, amountCents: 59_400_000 })
  })

  it('F3: pago aprobado de hace un año con la misma referencia y monto: el webhook no acredita y avisa', async () => {
    const t = await seed()

    const res = await pay(t, { dateCreated: addYears(NOW, -1).toISOString() })

    expect(res).toEqual({ enableFlag: false })
    expect((await subRow(t)).plus_enabled).toBe(false)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(1)
    expect(sent[0]?.text).toContain('anterior a la cotización')
  })

  it('F3: un pago sin fecha (o con fecha ilegible) no prende Plus: va por unmatched', async () => {
    const t = await seed()

    expect(await pay(t, { id: 'mp-pay-sin-fecha', dateCreated: null })).toEqual({
      enableFlag: false,
    })
    expect(await pay(t, { id: 'mp-pay-rota', dateCreated: 'ayer' })).toEqual({ enableFlag: false })

    expect((await subRow(t)).plus_enabled).toBe(false)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(2)
  })

  it('F3: el rescate descarta en silencio un pago viejo: ni acredita, ni mail, ni audit, ni reclamo', async () => {
    const t = await seed()
    gateway.searchResults[buildSaasPlusRef(t)] = [
      {
        mpPaymentId: 'mp-pay-viejo',
        status: 'approved',
        amount: QUOTE_CENTS,
        externalReference: buildSaasPlusRef(t),
        paymentMethodId: 'account_money',
        dateCreated: addYears(NOW, -1).toISOString(),
      },
    ]

    await reconcileSubscriptions()
    await reconcileSubscriptions()

    expect((await subRow(t)).plus_enabled).toBe(false)
    expect(sent).toHaveLength(0)
    expect(await auditCount(t, 'plus.prorate_payment_unmatched')).toBe(0)
    expect(await claimedKeys()).toEqual([])
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)
  })

  it('F3: un pago posterior a la cotización acredita como siempre', async () => {
    const t = await seed()

    const res = await pay(t, { dateCreated: NOW.toISOString() })

    expect(res).toEqual({ enableFlag: true })
  })
})
