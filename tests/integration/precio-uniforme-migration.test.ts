import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TransactionSql } from 'postgres'
import { adminSql } from '../helpers/admin-db'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const migration = readFileSync(
  'src/shared/db/migrations/095_precio_uniforme_por_cancha.sql',
  'utf8',
)
  .replace(/^BEGIN;\r?$/m, '')
  .replace(/^COMMIT;\r?$/m, '')
const rollback = new Error('rollback fixture')
let tenantIds: string[]
beforeAll(async () => {
  const sql = adminSql()
  await ensureRoles(sql)
  tenantIds = [(await createTestTenant(sql)).id, (await createTestTenant(sql)).id]
})
afterAll(async () => cleanupAll(adminSql()))

// Catálogo y fixtures globales: pool administrativo, siempre rollback.
async function oldCatalog(tx: TransactionSql) {
  await tx`DELETE FROM price_versions WHERE price_first_court_cents = 3000000`
  await tx`UPDATE price_versions SET valid_until = NULL WHERE plan_id = (SELECT id FROM plans WHERE slug = 'turnogol')`
  await tx`UPDATE plans SET price_first_court_cents = 4700000, price_monthly = 4700000,
    price_annual = 4230000 WHERE slug = 'turnogol'`
}
async function seedSubscriptions(tx: TransactionSql) {
  for (const [index, tenantId] of tenantIds.entries()) {
    await tx`INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, billed_courts, status, mp_subscription_id,
      current_period_start, current_period_end, pending_billed_courts, pending_change_at
    ) VALUES (
      ${tenantId}, (SELECT id FROM plans WHERE slug = 'turnogol'),
      ${index === 0 ? 'monthly' : 'annual'}::billing_cycle, ${index === 0 ? 5 : 3},
      ${index === 0 ? 'trialing' : 'active'}::subscription_status, ${'verified-' + index},
      NOW(), NOW() + INTERVAL '30 days', 6, NOW() + INTERVAL '30 days'
    )`
  }
}
async function confirmMp(tx: TransactionSql) {
  await tx`INSERT INTO audit_logs (tenant_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
    SELECT tenant_id, '00000000-0000-0000-0000-000000000000', 'system',
      'subscription.price_repriced', 'tenant_subscription', tenant_id,
      jsonb_build_object('mpSubscriptionId', mp_subscription_id, 'billedCourts', billed_courts,
        'billingCycle', billing_cycle, 'localUpdatedAt', updated_at,
        'amountCents', CASE WHEN billing_cycle = 'annual' THEN 97200000 ELSE 15000000 END)
    FROM tenant_subscriptions WHERE tenant_id IN ${tx(tenantIds)}`
}
describe('095 precio uniforme — guard, historial, idempotencia y suscripciones intactas', () => {
  it('aplica luego de MP confirmado, conserva snapshots y no duplica la versión al repetir', async () => {
    await expect(
      adminSql().begin(async (tx) => {
        await oldCatalog(tx)
        await seedSubscriptions(tx)
        await confirmMp(tx)
        const before =
          await tx`SELECT row_to_json(s) AS row FROM tenant_subscriptions s ORDER BY tenant_id`
        const versions =
          await tx`SELECT id, price_first_court_cents, valid_from FROM price_versions ORDER BY id`
        await tx.unsafe(migration)
        expect(
          await tx`SELECT row_to_json(s) AS row FROM tenant_subscriptions s ORDER BY tenant_id`,
        ).toEqual(before)
        const [plan] =
          await tx`SELECT price_first_court_cents, price_extra_court_cents, price_monthly, price_annual FROM plans WHERE is_active`
        expect(plan).toEqual({
          price_first_court_cents: 3000000,
          price_extra_court_cents: 3000000,
          price_monthly: 3000000,
          price_annual: 2700000,
        })
        const current = await tx`SELECT * FROM price_versions ORDER BY id`
        await tx.unsafe(migration)
        expect(await tx`SELECT * FROM price_versions ORDER BY id`).toEqual(current)
        expect(
          await tx`SELECT id, price_first_court_cents, valid_from FROM price_versions WHERE price_first_court_cents IS DISTINCT FROM 3000000 ORDER BY id`,
        ).toEqual(versions)
        throw rollback
      }),
    ).rejects.toBe(rollback)
  })
  it('aborta si un preapproval vivo no tiene confirmación', async () => {
    await expect(
      adminSql().begin(async (tx) => {
        await oldCatalog(tx)
        await seedSubscriptions(tx)
        await tx.unsafe(migration)
        throw rollback
      }),
    ).rejects.toThrow('preapproval vivo sin verificacion')
  })
  it('una confirmación vieja no sirve después de un cambio de la suscripción', async () => {
    await expect(
      adminSql().begin(async (tx) => {
        await oldCatalog(tx)
        await seedSubscriptions(tx)
        await confirmMp(tx)
        await tx`ALTER TABLE tenant_subscriptions DISABLE TRIGGER set_updated_at`
        await tx`UPDATE tenant_subscriptions SET updated_at = updated_at + INTERVAL '1 microsecond' WHERE tenant_id = ${tenantIds[0]!}`
        await tx`ALTER TABLE tenant_subscriptions ENABLE TRIGGER set_updated_at`
        await tx.unsafe(migration)
        throw rollback
      }),
    ).rejects.toThrow('preapproval vivo sin verificacion')
  })
})
