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

import { createCashFlow, getCashFlows, getDaySummary } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import {
  DayAlreadyClosedError,
  DayAlreadyCloseExistsError,
  CloseDateInFutureError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { settleRefund } from '@/modules/payments/payment.service'

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
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 }] })},
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
  const rows = await sql<
    {
      id: string
      total_income: number
      total_adjustments: number
      balance: number
    }[]
  >`
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
      createCashFlow(
        tenant.id,
        staff.id,
        {
          type: 'income',
          category: 'booking',
          amount: 800000,
          method: 'cash',
          description: 'Cobro turno 14:00',
        },
        tx,
      ),
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
      createCashFlow(
        tenant.id,
        staff.id,
        {
          type: 'adjustment',
          category: 'no_show_correction',
          amount: 200000,
          method: 'other',
          description: 'Ajuste por no-show',
        },
        tx,
      ),
    )

    expect(cf.type).toBe('adjustment')
    expect(cf.category).toBe('no_show_correction')
    expect(cf.amount).toBe(200000)
    expect(cf.method).toBe('other')
    expect(cf.description).toBe('Ajuste por no-show')
    expect(cf.registeredBy).toBe(staff.id)
    expect(cf.tenantId).toBe(tenant.id)
  })

  it('creates an expense cashflow (operating_expense)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const cf = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staff.id,
        {
          type: 'expense',
          category: 'operating_expense',
          amount: 350000,
          method: 'cash',
          description: 'Compra de pelotas',
        },
        tx,
      ),
    )

    expect(cf.type).toBe('expense')
    expect(cf.category).toBe('operating_expense')
    expect(cf.amount).toBe(350000)
    expect(cf.method).toBe('cash')
    expect(cf.description).toBe('Compra de pelotas')
    expect(cf.registeredBy).toBe(staff.id)
    expect(cf.tenantId).toBe(tenant.id)
  })

  // migr. 050 — gastos categorizados. El unit cashflow-service.test.ts cubre
  // validateCashFlowCombo aislado; acá se verifica el flujo real de
  // createCashFlow con las categorías nuevas y el legacy conviviendo.
  describe('migr. 050 — categorías de gasto nuevas', () => {
    it.each(['merchandise', 'salaries'] as const)(
      'creates an expense cashflow with the new category %s',
      async (category) => {
        const sql = getSql()
        const tenant = await createTestTenant(sql)
        const staff = await createTestStaffUser(sql)
        await linkStaffToTenant(sql, tenant.id, staff.id)

        const cf = await withTenantContext(tenant.id, (tx) =>
          createCashFlow(
            tenant.id,
            staff.id,
            {
              type: 'expense',
              category,
              amount: 150000,
              method: 'cash',
              description: `Gasto ${category}`,
            },
            tx,
          ),
        )

        expect(cf.type).toBe('expense')
        expect(cf.category).toBe(category)
        expect(cf.amount).toBe(150000)
      },
    )

    it('rejects income + merchandise (categoría de gasto en un ingreso)', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const staff = await createTestStaffUser(sql)
      await linkStaffToTenant(sql, tenant.id, staff.id)

      await expect(
        withTenantContext(tenant.id, (tx) =>
          createCashFlow(
            tenant.id,
            staff.id,
            {
              type: 'income',
              category: 'merchandise',
              amount: 100000,
              method: 'cash',
              description: 'Combo inválido (income + merchandise)',
            },
            tx,
          ),
        ),
      ).rejects.toBeInstanceOf(InvalidCashFlowCategoryError)

      expect(await countCashFlows(tenant.id)).toBe(0)
    })

    it('operating_expense (legacy) sigue siendo aceptado por createCashFlow', async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const staff = await createTestStaffUser(sql)
      await linkStaffToTenant(sql, tenant.id, staff.id)

      const cf = await withTenantContext(tenant.id, (tx) =>
        createCashFlow(
          tenant.id,
          staff.id,
          {
            type: 'expense',
            category: 'operating_expense',
            amount: 90000,
            method: 'cash',
            description: 'Gasto legacy',
          },
          tx,
        ),
      )

      expect(cf.category).toBe('operating_expense')
    })
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
      getDaySummary(tenant.id, TODAY, 0, tx),
    )
    expect(summary.totalIncome).toBe(650000)
    expect(summary.totalExpense).toBe(200000)
    expect(summary.balance).toBe(450000)
    // byMethod es neto por método (arqueo): 650000 entran - 200000 salen, todo en cash.
    expect(summary.byMethod.cash).toBe(450000)

    const close = await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, TODAY, staff.id, {}, 0, tx),
    )
    expect(close.totalIncome).toBe(650000)
    expect(close.totalExpense).toBe(200000)
    expect(close.balance).toBe(450000)
  })

  // Antes: "a canteen quick sale appears in the day list". El nombre mentía —
  // no ejercitaba ningún código de cantina, solo createCashFlow + getCashFlows,
  // y traía un clientIdempotencyKey muerto (jamás verificaba el dedup). El dedup
  // ahora vive en su propio test ("deduplicates ... idempotency key"). Este test
  // queda honesto: un product_sale recién creado vuelve en el feed del día.
  it('lists a freshly created product_sale movement in the day feed', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const created = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staff.id,
        {
          type: 'income',
          category: 'product_sale',
          amount: 500000, // Gatorade $2.500 x2
          method: 'cash',
          description: 'Gatorade x2',
        },
        tx,
      ),
    )

    const list = await withTenantContext(tenant.id, (tx) => getCashFlows(tenant.id, TODAY, 0, tx))
    const sale = list.find((cf) => cf.id === created.id)
    expect(sale).toBeDefined()
    expect(sale!.type).toBe('income')
    expect(sale!.category).toBe('product_sale')
    expect(sale!.amount).toBe(500000)
    expect(sale!.description).toBe('Gatorade x2')
    expect(sale!.method).toBe('cash')
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
      closeDailyRegister(tenant.id, TODAY, staff.id, { declaredCash: 500000 }, 0, tx),
    )

    expect(close.totalIncome).toBe(1300000)
    expect(close.totalAdjustments).toBe(100000)
    expect(close.balance).toBe(1400000)
    expect(close.declaredCash).toBe(500000)
    // Semántica migr. 049: el arqueo es SOLO efectivo. Sin apertura, expected =
    // 0 + neto cash (500000, el turno transfer y el ajuste 'other' no cuentan);
    // declared 500000 → diff 0 (el efectivo cuadra aunque balance sea 1400000).
    expect(close.openingCash).toBe(0)
    expect(close.expectedCash).toBe(500000)
    expect(close.diffAmount).toBe(0)

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
      closeDailyRegister(tenant.id, TODAY, staff.id, {}, 0, tx),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        closeDailyRegister(tenant.id, TODAY, staff.id, {}, 0, tx),
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
      closeDailyRegister(tenant.id, TODAY, staff.id, {}, 0, tx),
    )

    // Try insert cashflow for the same day
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createCashFlow(
          tenant.id,
          staff.id,
          {
            type: 'income',
            category: 'other',
            amount: 100000,
            method: 'cash',
            description: 'Late entry',
          },
          tx,
        ),
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
        starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, status
      )
      VALUES (
        ${tenant.id}, ${courtId}, ${player.id},
        ${FUTURE_DATE}::date, '14:00'::time, '15:00'::time,
        (${FUTURE_DATE}::date + '14:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${FUTURE_DATE}::date + '15:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
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

    const outcome = await withTenantContext(tenant.id, (tx) =>
      cancelByPlayer(bookingId, player.id, 'test refund', mockGateway as never, tx),
    )
    // caza-bugs #3: prepareRefund solo deja la fila 'pending'; la llamada a MP
    // (settleRefund) corre después de que la tx de cancelación commiteó.
    expect(outcome.pendingRefund).toBeDefined()
    await settleRefund(outcome.pendingRefund!, mockGateway, tenant.id)

    // Refund was called (money returned via MP)
    expect(mockGateway.refundCalls.length).toBe(refundsBefore + 1)
    // But no cashflow rows were created
    const afterCount = await countCashFlows(tenant.id)
    expect(afterCount).toBe(beforeCount)
  })

  // GAP G1 — Idempotencia (Fix #55). El unit caja-idempotency-key.test.ts solo
  // verifica que la key sobrevive el schema de la action con createCashFlow
  // MOCKEADO; nadie probaba el ON CONFLICT real en DB. Sin este test, romper el
  // índice/cláusula ON CONFLICT duplica ventas de cantina por doble-tap.
  it('deduplicates a repeated movement carrying the same idempotency key', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const key = crypto.randomUUID()

    const payload = {
      type: 'income' as const,
      category: 'product_sale' as const,
      amount: 125000,
      method: 'cash' as const,
      description: 'Gaseosa',
      clientIdempotencyKey: key,
    }

    const first = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, staff.id, payload, tx),
    )
    // Segundo submit con la MISMA key (doble-tap / reintento de red).
    const second = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, staff.id, payload, tx),
    )

    // Devuelve la fila original, no una nueva...
    expect(second.id).toBe(first.id)
    // ...y la caja sigue teniendo UNA sola fila (no se duplicó el cobro).
    expect(await countCashFlows(tenant.id)).toBe(1)
  })

  // GAP G2 — Aislamiento multi-tenant. cash_flows es tabla aislada; getDaySummary
  // y getCashFlows filtran por tenant_id en el WHERE (no dependen solo de RLS).
  // Sin este test, borrar ese filtro filtraría la caja de un complejo vecino.
  it('never mixes another tenant cashflows into summary or day feed', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    const staffB = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)
    await linkStaffToTenant(sql, tenantB.id, staffB.id)

    // El complejo vecino (B) carga una venta gorda el mismo día.
    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tenantB.id}, 'income', 'booking', ${999000}, 'cash', ${'Caja vecino'}, ${staffB.id}, NOW())
    `
    // A carga un único ingreso.
    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tenantA.id}, 'income', 'booking', ${100000}, 'cash', ${'Mi turno'}, ${staffA.id}, NOW())
    `

    const summary = await withTenantContext(tenantA.id, (tx) =>
      getDaySummary(tenantA.id, TODAY, 0, tx),
    )
    // A solo ve lo suyo: los 999000 de B no contaminan el saldo.
    expect(summary.totalIncome).toBe(100000)
    expect(summary.balance).toBe(100000)

    const list = await withTenantContext(tenantA.id, (tx) => getCashFlows(tenantA.id, TODAY, 0, tx))
    expect(list).toHaveLength(1)
    expect(list[0]!.description).toBe('Mi turno')
    expect(list.some((cf) => cf.description === 'Caja vecino')).toBe(false)
  })

  // GAP G3 — Frontera de fecha ART. Las queries agrupan por
  // (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, no por UTC.
  // Un cobro de las 23:00 ART entra como 02:00 UTC del día siguiente; debe contar
  // en el día ART, no en el UTC. Time-bomb clásico si alguien usa ::date a secas.
  it('buckets a late-night cashflow by ART date, not UTC date', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    // 2026-01-15 02:00 UTC == 2026-01-14 23:00 ART (UTC-3). Pertenece al 14.
    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tenant.id}, 'income', 'booking', ${300000}, 'cash', ${'Cierre tarde'}, ${staff.id}, '2026-01-15T02:00:00Z')
    `

    const artDay = await withTenantContext(tenant.id, (tx) =>
      getCashFlows(tenant.id, '2026-01-14', 0, tx),
    )
    expect(artDay.map((cf) => cf.description)).toContain('Cierre tarde')

    const utcDay = await withTenantContext(tenant.id, (tx) =>
      getCashFlows(tenant.id, '2026-01-15', 0, tx),
    )
    expect(utcDay.some((cf) => cf.description === 'Cierre tarde')).toBe(false)

    const summary = await withTenantContext(tenant.id, (tx) =>
      getDaySummary(tenant.id, '2026-01-14', 0, tx),
    )
    expect(summary.totalIncome).toBe(300000)
  })

  // GAP G4 — No se puede cerrar una fecha futura (CloseDateInFutureError).
  it('rejects closing a future date', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    await expect(
      withTenantContext(tenant.id, (tx) =>
        closeDailyRegister(tenant.id, '2099-01-01', staff.id, {}, 0, tx),
      ),
    ).rejects.toBeInstanceOf(CloseDateInFutureError)
  })

  // GAP G5 — createCashFlow valida el combo type/category ANTES de insertar.
  // El unit cubre validateCashFlowCombo aislado; acá se verifica que el guard
  // corta dentro del flujo real y NO deja fila huérfana.
  it('rejects an invalid type/category combo and persists no row', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createCashFlow(
          tenant.id,
          staff.id,
          {
            type: 'income',
            category: 'operating_expense', // combo inválido
            amount: 100000,
            method: 'cash',
            description: 'Combo inválido',
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidCashFlowCategoryError)

    expect(await countCashFlows(tenant.id)).toBe(0)
  })

  // GAP G6 — Boundary: día sin movimientos. Debe devolver ceros, abierto y close null.
  it('returns a zeroed, open summary for a day with no movements', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    const summary = await withTenantContext(tenant.id, (tx) =>
      getDaySummary(tenant.id, TODAY, 0, tx),
    )
    expect(summary.totalIncome).toBe(0)
    expect(summary.totalExpense).toBe(0)
    expect(summary.totalAdjustments).toBe(0)
    expect(summary.balance).toBe(0)
    expect(summary.isClosed).toBe(false)
    expect(summary.close).toBeNull()
    expect(summary.byCategory).toEqual({})
    expect(summary.byMethod).toEqual({})
  })

  // GAP G7 — Efecto secundario: cerrar el día escribe un audit_log
  // (action cashflow.daily_close) con actor y metadata correctos.
  it('writes an audit log entry when the day is closed', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES (${tenant.id}, 'income', 'booking', ${400000}, 'cash', ${'Turno'}, ${staff.id}, NOW())
    `

    const close = await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, TODAY, staff.id, { declaredCash: 400000 }, 0, tx),
    )

    const audit = await sql<
      {
        action: string
        resource_id: string
        actor_id: string
        actor_type: string
        // BUG #2 fix: el metadata ahora se guarda single-encode → el driver
        // postgres-js lo devuelve como OBJETO (antes era un string doble-codificado).
        metadata: { balance: number; declaredCash: number }
      }[]
    >`
      SELECT action, resource_id, actor_id, actor_type, metadata
      FROM audit_logs
      WHERE tenant_id = ${tenant.id} AND action = 'cashflow.daily_close'
    `
    expect(audit).toHaveLength(1)
    expect(audit[0]!.resource_id).toBe(close.id)
    expect(audit[0]!.actor_id).toBe(staff.id)
    expect(audit[0]!.actor_type).toBe('staff')
    expect(audit[0]!.metadata.balance).toBe(400000)
    expect(audit[0]!.metadata.declaredCash).toBe(400000)
    // El acceso por campo via operador jsonb funciona (lo que el doble-encode rompía).
    const byField = await sql<{ balance: number }[]>`
      SELECT (metadata->>'balance')::int AS balance
      FROM audit_logs
      WHERE tenant_id = ${tenant.id} AND action = 'cashflow.daily_close'
    `
    expect(byField[0]!.balance).toBe(400000)
  })
})

/**
 * B8 — el camino con `clientIdempotencyKey` es el único de `createCashFlow` que
 * usa SQL crudo (`INSERT … RETURNING *` y, si ya existía, `SELECT *`). Estaba
 * casteado a `typeof cashFlows.$inferSelect`, que es el tipo del query builder:
 * claves camelCase. El crudo devuelve snake_case, así que el mapper leía
 * `r.tenantId`/`r.occurredAt` y ponía `undefined` en la fila que sale del
 * servicio — con TypeScript en verde y sin que nadie lo viera, porque los dos
 * consumidores de hoy solo usan `.id`.
 *
 * Los dos ramos (insert nuevo y fila ya existente) se prueban por separado: son
 * dos queries crudas distintas y cada una tenía su propio cast.
 */
describe('createCashFlow con idempotency key devuelve la fila completa (B8)', () => {
  it('el insert nuevo y el reintento devuelven los MISMOS datos, sin undefined', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const key = crypto.randomUUID()

    const input = {
      type: 'income' as const,
      category: 'other' as const,
      amount: 123400,
      method: 'cash' as const,
      description: 'Cobro con clave de idempotencia',
      clientIdempotencyKey: key,
    }

    const primero = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, staff.id, input, tx),
    )
    // Mismo key: ON CONFLICT DO NOTHING, cae al SELECT del segundo ramo.
    const reintento = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, staff.id, input, tx),
    )

    for (const [ramo, row] of [
      ['insert', primero],
      ['reintento', reintento],
    ] as const) {
      expect(row.id, ramo).toBeTruthy()
      // Los multi-palabra: exactamente los que llegaban undefined.
      expect(row.tenantId, ramo).toBe(tenant.id)
      expect(row.registeredBy, ramo).toBe(staff.id)
      expect(row.bookingId, ramo).toBeNull()
      expect(row.tournamentTeamId, ramo).toBeNull()
      expect(row.occurredAt, ramo).toBeInstanceOf(Date)
      expect(row.createdAt, ramo).toBeInstanceOf(Date)
      expect(Number.isNaN(row.occurredAt.getTime()), ramo).toBe(false)
      expect(row.amount, ramo).toBe(123400)
    }

    // Idempotencia de verdad: una sola fila, y la segunda llamada devuelve ESA.
    expect(reintento.id).toBe(primero.id)
    const count = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM cash_flows WHERE client_idempotency_key = ${key}
    `
    expect(Number(count[0]!.n)).toBe(1)
  })

  it('conserva bookingId cuando el movimiento va atado a un turno', async () => {
    // `bookingId` se leía como `r.bookingId` (undefined) y el `?? null` lo
    // convertía en null: un cobro atado a un turno volvía diciendo que no lo
    // estaba. El `?? null` era justo lo que hacía invisible al bug.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingRows = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        starts_at, ends_at, type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES (
        ${tenant.id}, ${courtId}, ${player.id}, ${TODAY}::date, '15:00'::time, '16:00'::time,
        (${TODAY}::date + '15:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${TODAY}::date + '16:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        'spontaneous', 'confirmed', 900000, 0, 'not_required'
      ) RETURNING id
    `
    const bookingId = bookingRows[0]!.id

    const row = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staff.id,
        {
          type: 'income',
          category: 'booking',
          amount: 900000,
          method: 'cash',
          description: 'Cobro de turno',
          bookingId,
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )

    expect(row.bookingId).toBe(bookingId)
  })
})
