import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getDb, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertCashFlow } from '../helpers/factories'
import { closeDailyRegister, getDailyClose } from '@/modules/cashflow/daily-close.service'
import { DayAlreadyCloseExistsError } from '@/modules/cashflow/cashflow.errors'
import { todayART } from '@/shared/time/art-date'

const TODAY = todayART()

async function seedTenantWithCashflows() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  // 2 income flows totaling 800000 cents.
  await insertCashFlow(sql, { tenantId: tenant.id, registeredBy: staff.id })
  await insertCashFlow(sql, { tenantId: tenant.id, registeredBy: staff.id })
  return { tenantId: tenant.id, staffId: staff.id }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => closeSql())

describe('daily close — idempotency + integrity (B8.4)', () => {
  it('closes day with aggregated totals (integer)', async () => {
    const { tenantId, staffId } = await seedTenantWithCashflows()

    const result = await getDb().transaction(async (tx) => {
      return closeDailyRegister(tenantId, TODAY, staffId, { declaredCash: 1000000 }, 0, tx)
    })

    expect(result.tenantId).toBe(tenantId)
    // 2 flows of 500000 each = 1000000 in income (per factories.ts default).
    expect(result.totalIncome).toBe(1000000)
    expect(result.balance).toBe(1000000)
    expect(result.declaredCash).toBe(1000000)
    // Migr. 049: ambos flows son cash → expected = 0 + 1000000; declared igual → diff 0.
    expect(result.openingCash).toBe(0)
    expect(result.expectedCash).toBe(1000000)
    expect(result.diffAmount).toBe(0)
    expect(Number.isInteger(result.totalIncome)).toBe(true)
    expect(Number.isInteger(result.balance)).toBe(true)
  })

  it('throws DayAlreadyCloseExistsError on 2nd close (sequential)', async () => {
    const { tenantId, staffId } = await seedTenantWithCashflows()

    await getDb().transaction(async (tx) => {
      await closeDailyRegister(tenantId, TODAY, staffId, {}, 0, tx)
    })

    await expect(
      getDb().transaction(async (tx) => {
        await closeDailyRegister(tenantId, TODAY, staffId, {}, 0, tx)
      }),
    ).rejects.toBeInstanceOf(DayAlreadyCloseExistsError)
  })

  it('concurrent N=5 closes → exactly 1 succeeds, rest throw', async () => {
    const { tenantId, staffId } = await seedTenantWithCashflows()

    const attempts = Array.from({ length: 5 }, () =>
      getDb().transaction(async (tx) => {
        return closeDailyRegister(tenantId, TODAY, staffId, {}, 0, tx)
      }),
    )

    const results = await Promise.allSettled(attempts)
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const errs = results.filter((r) => r.status === 'rejected').length
    expect(ok).toBe(1)
    expect(errs).toBe(4)

    // Only 1 row in DB.
    const sql = getSql()
    const [count] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM daily_cash_closes
      WHERE tenant_id = ${tenantId} AND date = ${TODAY}::date
    `
    expect(count.c).toBe(1)
  })

  it('diff = declared − expected (migr. 049: falta plata → negativo)', async () => {
    const { tenantId, staffId } = await seedTenantWithCashflows()

    const result = await getDb().transaction(async (tx) => {
      return closeDailyRegister(tenantId, TODAY, staffId, { declaredCash: 999999 }, 0, tx)
    })

    expect(result.balance).toBe(1000000)
    expect(result.declaredCash).toBe(999999)
    expect(result.expectedCash).toBe(1000000)
    expect(result.diffAmount).toBe(-1) // falta 1 centavo
  })

  it('getDailyClose returns the row after close', async () => {
    const { tenantId, staffId } = await seedTenantWithCashflows()

    const created = await getDb().transaction(async (tx) => {
      return closeDailyRegister(tenantId, TODAY, staffId, {}, 0, tx)
    })

    const fetched = await getDb().transaction(async (tx) =>
      getDailyClose(tenantId, TODAY, tx),
    )
    expect(fetched?.id).toBe(created.id)
    expect(fetched?.balance).toBe(created.balance)
  })
})
