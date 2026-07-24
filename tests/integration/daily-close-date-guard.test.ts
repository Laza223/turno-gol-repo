import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getDb, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { CloseDateInFutureError } from '@/modules/cashflow/cashflow.errors'

function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => closeSql())

describe('daily close — date guard BK-05', () => {
  it('rejects closing a future date (tomorrow ART)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const tomorrowART = artDateOf(new Date(Date.now() + 24 * 3600_000))

    await expect(
      getDb().transaction(async (tx) =>
        closeDailyRegister(tenant.id, tomorrowART, staff.id, {}, 0, tx),
      ),
    ).rejects.toBeInstanceOf(CloseDateInFutureError)
  })

  it('accepts closing today ART', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const todayART = artDateOf(new Date())

    const result = await getDb().transaction(async (tx) =>
      closeDailyRegister(tenant.id, todayART, staff.id, {}, 0, tx),
    )
    expect(result.date).toBeDefined()
  })

  it('accepts closing a past date', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const result = await getDb().transaction(async (tx) =>
      closeDailyRegister(tenant.id, '2026-01-14', staff.id, {}, 0, tx),
    )
    expect(result.date).toBeDefined()
  })

  it('aggregates midnight-boundary cash flow into the correct ART day, not the UTC day', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    // 2026-03-10 01:30 UTC = 2026-03-09 22:30 ART — belongs to March 9 in ART
    await sql`
      INSERT INTO cash_flows (
        tenant_id, type, category, amount, method,
        description, registered_by, occurred_at
      ) VALUES (
        ${tenant.id}, 'income', 'booking', ${500000}, 'cash',
        ${'Boundary test - midnight cross'}, ${staff.id},
        ${'2026-03-10 01:30:00+00'}::timestamptz
      )
    `

    // Closing 2026-03-09 (ART day that owns the flow) → should aggregate it
    const closeArtDay = await getDb().transaction(async (tx) =>
      closeDailyRegister(tenant.id, '2026-03-09', staff.id, {}, 0, tx),
    )
    expect(closeArtDay.totalIncome).toBe(500000)

    // Closing 2026-03-10 (the UTC day it was inserted, but NOT its ART day) → 0 income
    const closeUtcDay = await getDb().transaction(async (tx) =>
      closeDailyRegister(tenant.id, '2026-03-10', staff.id, {}, 0, tx),
    )
    expect(closeUtcDay.totalIncome).toBe(0)
  })
})
