import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, withTenantContext } from '@/shared/db/client'
import { reactivate, subscribe } from '@/modules/billing/billing.service'
import { COURT_COUNT_PRICE_SLUG, COURT_COUNT_QUOTE_PREFIX } from '@/modules/billing/pricing'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  applyCurrentCatalogPrice,
  saveLargeComplexQuote,
} from '@/modules/super-admin/support.service'
import { adminSql } from '../helpers/admin-db'
import {
  createTestStaffUser,
  createTestSystemAdmin,
  createTestTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

const sql = adminSql()
const legacy = 'turnogol'

beforeAll(async () => {
  const [catalog] = await sql<{ is_active: boolean }[]>`
    SELECT is_active FROM plans WHERE slug = ${COURT_COUNT_PRICE_SLUG}
  `
  expect(catalog?.is_active).toBe(false)
  await sql`
    UPDATE plans SET is_active = (slug = ${COURT_COUNT_PRICE_SLUG})
    WHERE slug IN (${legacy}, ${COURT_COUNT_PRICE_SLUG})
  `
})

afterAll(async () => {
  await sql`
    UPDATE plans SET is_active = (slug = ${legacy})
    WHERE slug IN (${legacy}, ${COURT_COUNT_PRICE_SLUG})
  `
  await closeSql()
})

async function seed(courts: number, active = false) {
  const tenant = await createTestTenant(sql)
  const owner = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, owner.id)
  await sql`
    INSERT INTO courts (tenant_id, name, capacity)
    SELECT ${tenant.id}, 'Cancha ' || n, 10 FROM generate_series(1, ${courts}::int) AS n
  `
  const status = active ? 'active' : 'trialing'
  await sql`UPDATE tenants SET status = ${status}::tenant_status WHERE id = ${tenant.id}`
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billed_courts, status, current_period_start, current_period_end,
      mp_subscription_id
    )
    SELECT ${tenant.id}, id, ${courts}, ${status}::subscription_status, NOW(),
           NOW() + INTERVAL '20 days', ${active ? 'fixture-preapproval' : null}
    FROM plans WHERE slug = ${legacy}
  `
  return tenant.id
}

async function getAssignedPlan(tenantId: string) {
  const [row] = await sql<{ slug: string; plus_enabled: boolean }[]>`
    SELECT plans.slug, ts.plus_enabled
    FROM tenant_subscriptions ts JOIN plans ON plans.id = ts.plan_id
    WHERE ts.tenant_id = ${tenantId}
  `
  return row
}

describe('catálogo por cantidad en checkout y contratos existentes', () => {
  it('genera el anual de cinco canchas desde la lista activa', async () => {
    const tenantId = await seed(5)
    const gateway = new MockGateway()
    await withTenantContext(tenantId, (tx) => subscribe(tenantId, 5, 'annual', gateway, tx))
    expect(gateway.preapprovalCalls[0]).toMatchObject({ amount: 105_600_000, frequency: 'annual' })
    expect((await getAssignedPlan(tenantId))?.slug).toBe(COURT_COUNT_PRICE_SLUG)
  })

  it('bloquea 8+ hasta guardar una cotización privada y luego usa ese importe', async () => {
    const tenantId = await seed(8)
    const admin = await createTestSystemAdmin(sql)
    const gateway = new MockGateway()
    const checkout = () =>
      withTenantContext(tenantId, (tx) => subscribe(tenantId, 8, 'annual', gateway, tx))

    await expect(checkout()).rejects.toMatchObject({ code: 'COURT_COUNT_QUOTE_REQUIRED' })
    expect(gateway.preapprovalCalls).toHaveLength(0)

    await expect(saveLargeComplexQuote(tenantId, 16_500_000, admin.id)).resolves.toBeNull()
    expect((await getAssignedPlan(tenantId))?.slug).toMatch(
      new RegExp(`^${COURT_COUNT_QUOTE_PREFIX}`),
    )
    await checkout()
    expect(gateway.preapprovalCalls[0]).toMatchObject({ amount: 158_400_000, frequency: 'annual' })
  })

  it('usa la cotización privada al activar un complejo grande desde Gratis', async () => {
    const tenantId = await seed(8)
    const admin = await createTestSystemAdmin(sql)
    const gateway = new MockGateway()
    await sql`UPDATE tenants SET status = 'free' WHERE id = ${tenantId}`
    await sql`UPDATE tenant_subscriptions SET status = 'free' WHERE tenant_id = ${tenantId}`

    await expect(saveLargeComplexQuote(tenantId, 16_500_000, admin.id)).resolves.toBeNull()
    await withTenantContext(tenantId, (tx) => reactivate(tenantId, 8, 'monthly', gateway, tx))

    expect(gateway.preapprovalCalls[0]).toMatchObject({ amount: 16_500_000, frequency: 'monthly' })
  })

  it('traslada tarifa y Plus solo al mandato verificado, con rollback si falla Mercado Pago', async () => {
    const tenantId = await seed(5, true)
    const admin = await createTestSystemAdmin(sql)
    await sql`INSERT INTO feature_flags (key, value, tenant_id) VALUES ('whatsapp_bot', true, ${tenantId})`
    const gateway = new MockGateway()
    gateway.subscriptionState = {
      preapprovalId: 'fixture-preapproval',
      externalReference: tenantId,
      status: 'authorized',
      amountCents: 15_000_000,
      frequency: 1,
      frequencyType: 'months',
      nextPaymentDate: new Date('2030-01-21T12:00:00Z'),
      lastChargedDate: null,
      chargedQuantity: 1,
      lastChargedAmountCents: 15_000_000,
    }
    const apply = (amount = 14_500_000) =>
      applyCurrentCatalogPrice(
        tenantId,
        admin.id,
        amount,
        gateway,
        new Date('2030-01-01T12:00:00Z'),
      )

    expect(await getAssignedPlan(tenantId)).toEqual({ slug: legacy, plus_enabled: false })
    expect(await apply(11_000_000)).toMatch(/importe cambió/)
    expect(gateway.updatePreapprovalCalls).toHaveLength(0)

    gateway.updatePreapprovalError = new Error('Mercado Pago no respondió')
    await expect(apply()).rejects.toThrow('Mercado Pago no respondió')
    expect((await getAssignedPlan(tenantId))?.slug).toBe(legacy)

    gateway.updatePreapprovalError = undefined
    expect(await apply()).toBeNull()
    expect(await getAssignedPlan(tenantId)).toEqual({
      slug: COURT_COUNT_PRICE_SLUG,
      plus_enabled: true,
    })
    expect(gateway.updatePreapprovalCalls.at(-1)).toMatchObject({ amount: 14_500_000 })
    expect(await apply()).toBeNull()
    expect(gateway.updatePreapprovalCalls).toHaveLength(2)
  })
})
