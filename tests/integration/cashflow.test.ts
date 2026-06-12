import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-gateway.implementation', () => {
  return {
    MercadoPagoGateway: class {
      constructor(_encryptedAccessToken: string) {}
      createPreference = (...args: Parameters<MockGateway['createPreference']>) =>
        mockGateway.createPreference(...args)
      getPaymentStatus = (...args: Parameters<MockGateway['getPaymentStatus']>) =>
        mockGateway.getPaymentStatus(...args)
      createRefund = (...args: Parameters<MockGateway['createRefund']>) =>
        mockGateway.createRefund(...args)
    },
  }
})

import { createCashFlow, getDaySummary, getDayComparisons } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import {
  DayAlreadyClosedError,
  DayAlreadyCloseExistsError,
} from '@/modules/cashflow/cashflow.errors'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'

function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

const TODAY = artDateOf(new Date())

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Caja Test'}, ${10},
      ${sql.json({ rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 800000, '120': 1500000 } }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function countCashFlows(tenantId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM cash_flows WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

async function getDailyCashClose(tenantId: string, date: string) {
  const sql = getSql()
  const rows = await sql<{
    id: string
    total_income: number
    total_adjustments: number
    balance: number
  }[]>`
    SELECT id, total_income, total_adjustments, balance
    FROM daily_cash_closes
    WHERE tenant_id = ${tenantId} AND date = ${date}::date
    LIMIT 1
  `
  return rows[0] ?? null
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('cashflow service', () => {
  it('creates an income cashflow', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const cf = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, staff.id, {
        type: 'income',
        category: 'booking',
        amount: 800000,
        method: 'cash',
        description: 'Cobro turno 14:00',
      }, tx),
    )

    expect(cf.type).toBe('income')
    expect(cf.category).toBe('booking')
    expect(cf.amount).toBe(800000)
    expect(cf.method).toBe('cash')
    expect(cf.registeredBy).toBe(staff.id)
    expect(cf.tenantId).toBe(tenant.id)
  })

  it('creates an adjustment cashflow (no_show_correction)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const cf = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, staff.id, {
        type: 'adjustment',
        category: 'no_show_correction',
        amount: 200000,
        method: 'other',
        description: 'Ajuste por no-show',
      }, tx),
    )

    expect(cf.type).toBe('adjustment')
    expect(cf.category).toBe('no_show_correction')
    expect(cf.amount).toBe(200000)
  })

  it('creates an expense cashflow (operating_expense)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const cf = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, staff.id, {
        type: 'expense',
        category: 'operating_expense',
        amount: 350000,
        method: 'cash',
        description: 'Compra de pelotas',
      }, tx),
    )

    expect(cf.type).toBe('expense')
    expect(cf.category).toBe('operating_expense')
    expect(cf.amount).toBe(350000)
  })

  it('day summary and close compute ingresos - egresos = saldo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES
        (${tenant.id}, 'income', 'booking', ${500000}, 'cash', ${'Turno'}, ${staff.id}, NOW()),
        (${tenant.id}, 'income', 'product_sale', ${150000}, 'cash', ${'Gatorade'}, ${staff.id}, NOW()),
        (${tenant.id}, 'expense', 'operating_expense', ${200000}, 'cash', ${'Hielo y carbón'}, ${staff.id}, NOW())
    `

    const summary = await withTenantContext(tenant.id, (tx) =>
      getDaySummary(tenant.id, TODAY, tx),
    )
    expect(summary.totalIncome).toBe(650000)
    expect(summary.totalExpense).toBe(200000)
    expect(summary.balance).toBe(450000)
    // byMethod es neto por método (arqueo): 650000 entran - 200000 salen, todo en cash.
    expect(summary.byMethod.cash).toBe(450000)

    const close = await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, TODAY, staff.id, {}, tx),
    )
    expect(close.totalIncome).toBe(650000)
    expect(close.totalExpense).toBe(200000)
    expect(close.balance).toBe(450000)
  })

  it('getDayComparisons aggregates yesterday and weekly daily average', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES
        (${tenant.id}, 'income', 'booking', ${700000}, 'cash', ${'Turno ayer'}, ${staff.id}, NOW() - interval '1 day'),
        (${tenant.id}, 'expense', 'operating_expense', ${100000}, 'cash', ${'Gasto ayer'}, ${staff.id}, NOW() - interval '1 day'),
        (${tenant.id}, 'income', 'booking', ${1400000}, 'cash', ${'Turno hace 3 días'}, ${staff.id}, NOW() - interval '3 days'),
        (${tenant.id}, 'income', 'booking', ${999999}, 'cash', ${'Fuera de ventana'}, ${staff.id}, NOW() - interval '9 days'),
        (${tenant.id}, 'income', 'booking', ${555555}, 'cash', ${'Hoy no cuenta'}, ${staff.id}, NOW())
    `

    const comp = await withTenantContext(tenant.id, (tx) =>
      getDayComparisons(tenant.id, TODAY, tx),
    )

    expect(comp.yesterday).toEqual({ totalIncome: 700000, totalExpense: 100000, balance: 600000 })
    // Semana = 7 días anteriores a hoy: 700000 + 1400000 ingresos, 100000 egresos.
    expect(comp.weekAvg.totalIncome).toBe(Math.round(2100000 / 7))
    expect(comp.weekAvg.totalExpense).toBe(Math.round(100000 / 7))
    expect(comp.weekAvg.balance).toBe(Math.round(2000000 / 7))
  })

  it('closes the day and aggregates totals correctly', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    // Insert 2 income + 1 adjustment cashflows for today
    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES
        (${tenant.id}, 'income', 'booking', ${500000}, 'cash', ${'Turno 1'}, ${staff.id}, NOW()),
        (${tenant.id}, 'income', 'booking', ${800000}, 'transfer', ${'Turno 2'}, ${staff.id}, NOW()),
        (${tenant.id}, 'adjustment', 'no_show_correction', ${100000}, 'other', ${'Ajuste'}, ${staff.id}, NOW())
    `

    const close = await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, TODAY, staff.id, { declaredCash: 500000 }, tx),
    )

    expect(close.totalIncome).toBe(1300000)
    expect(close.totalAdjustments).toBe(100000)
    expect(close.balance).toBe(1400000)
    expect(close.declaredCash).toBe(500000)
    expect(close.diffAmount).toBe(900000)

    const dbRow = await getDailyCashClose(tenant.id, TODAY)
    expect(dbRow).not.toBeNull()
    expect(dbRow!.total_income).toBe(1300000)
    expect(dbRow!.balance).toBe(1400000)
  })

  it('rejects double close for same day', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, TODAY, staff.id, {}, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        closeDailyRegister(tenant.id, TODAY, staff.id, {}, tx),
      ),
    ).rejects.toBeInstanceOf(DayAlreadyCloseExistsError)
  })

  it('rejects cashflow insert for already-closed date', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    // Close today first
    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, TODAY, staff.id, {}, tx),
    )

    // Try insert cashflow for the same day
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createCashFlow(tenant.id, staff.id, {
          type: 'income',
          category: 'other',
          amount: 100000,
          method: 'cash',
          description: 'Late entry',
        }, tx),
      ),
    ).rejects.toBeInstanceOf(DayAlreadyClosedError)
  })

  it('P10 regression: cancelByPlayer with paid deposit creates no cashflow rows', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    const player = await createTestPlayer(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    // Set cancellation policy: 48h before → in-policy for future date
    await sql`
      UPDATE tenants
      SET settings = settings || ${sql.json({ cancellation_policy: { hours_before: 48, penalty_type: 'deposit', penalty_amount: null } })}
      WHERE id = ${tenant.id}
    `

    const FUTURE_DATE = '2027-12-01'
    // Insert booking without payment first (constraint requires payment_id when method='mercadopago')
    const bookingId = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        price_snapshot, deposit_amount, deposit_status, status
      )
      VALUES (
        ${tenant.id}, ${courtId}, ${player.id},
        ${FUTURE_DATE}::date, '14:00'::time, '15:00'::time,
        ${800000}, ${240000}, 'paid', 'confirmed'
      )
      RETURNING id
    `.then((r) => r[0]!.id)

    const paymentId = await sql<{ id: string }[]>`
      INSERT INTO payments (
        tenant_id, booking_id, player_id, amount, currency,
        type, method, status, mp_payment_id, processed_at
      )
      VALUES (
        ${tenant.id}, ${bookingId}, ${player.id}, ${240000}, 'ARS',
        'deposit', 'mercadopago', 'approved', ${'mp-cf-test-001'}, NOW()
      )
      RETURNING id
    `.then((r) => r[0]!.id)

    await sql`UPDATE bookings SET payment_method = 'mercadopago', payment_id = ${paymentId} WHERE id = ${bookingId}`

    const refundsBefore = mockGateway.refundCalls.length
    const beforeCount = await countCashFlows(tenant.id)

    await withTenantContext(tenant.id, (tx) =>
      cancelByPlayer(bookingId, player.id, 'test refund', mockGateway as never, tx),
    )

    // Refund was called (money returned via MP)
    expect(mockGateway.refundCalls.length).toBe(refundsBefore + 1)
    // But no cashflow rows were created
    const afterCount = await countCashFlows(tenant.id)
    expect(afterCount).toBe(beforeCount)
  })
})
