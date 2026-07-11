import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  loadAbonadoCredit,
  setBookingAbonadoCredit,
} from '@/modules/abonados/abonado.service'
import {
  InsufficientCreditError,
  CreditNotApplicableError,
} from '@/modules/abonados/abonado.errors'
import { registerDebtPayment } from '@/modules/relationships/ptr.service'
import { NoDebtError, DebtOverpaymentError } from '@/modules/relationships/ptr.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Saldo'}, ${10},
      ${sql.json({ rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', price: 1000000 }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertAbonado(opts: {
  tenantId: string
  courtId: string
  playerId: string
  pricePerSession: number
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO abonados (
      tenant_id, court_id, player_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, monthly_price, starts_on, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId}, ${'Juan Grupo'}, ${'1199'},
      3, ${'20:00'}::time, ${'21:00'}::time, ${opts.pricePerSession}, ${opts.pricePerSession * 4},
      ${FUTURE_DATE}::date, 'active'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertFixedBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  abonadoId: string
  price: number
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, abonado_id, date, time_start, time_end,
      starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status, payment_method
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId}, ${opts.abonadoId},
      ${FUTURE_DATE}::date, ${'20:00'}::time, ${'21:00'}::time,
      (${FUTURE_DATE}::date + ${'20:00'}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${'21:00'}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      'fixed', 'confirmed', ${opts.price}, 0, 'not_required', NULL
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function readAbonadoCredit(abonadoId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ credit_balance: number }[]>`
    SELECT credit_balance FROM abonados WHERE id = ${abonadoId}
  `
  return Number(rows[0]!.credit_balance)
}

async function readBalance(tenantId: string, playerId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ balance: number }[]>`
    SELECT balance FROM player_tenant_relationships WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `
  return Number(rows[0]!.balance)
}

async function countAbonadoPaymentCashflows(tenantId: string, abonadoId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM cash_flows
    WHERE tenant_id = ${tenantId} AND abonado_id = ${abonadoId} AND category = 'abonado_payment'
  `
  return rows[0]!.n
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('Tarea #4 — Saldo a favor de abonados', () => {
  it('carga saldo como CashFlow income/abonado_payment y acredita el credit_balance', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const abonadoId = await insertAbonado({ tenantId: tenant.id, courtId, playerId: player.id, pricePerSession: 10_000_00 })

    const r1 = await withTenantContext(tenant.id, (tx) =>
      loadAbonadoCredit(tenant.id, staff.id, { abonadoId, amount: 40_000_00, method: 'cash' }, tx),
    )
    expect(r1.cashFlow.type).toBe('income')
    expect(r1.cashFlow.category).toBe('abonado_payment')
    expect(r1.cashFlow.abonadoId).toBe(abonadoId)
    expect(r1.abonado.creditBalance).toBe(40_000_00)
    expect(await readAbonadoCredit(abonadoId)).toBe(40_000_00)

    const r2 = await withTenantContext(tenant.id, (tx) =>
      loadAbonadoCredit(tenant.id, staff.id, { abonadoId, amount: 10_000_00, method: 'transfer' }, tx),
    )
    expect(r2.abonado.creditBalance).toBe(50_000_00)
    expect(await countAbonadoPaymentCashflows(tenant.id, abonadoId)).toBe(2)
  })

  it('idempotencia: la misma clave no duplica el CashFlow ni dobla el saldo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const abonadoId = await insertAbonado({ tenantId: tenant.id, courtId, playerId: player.id, pricePerSession: 10_000_00 })

    const key = '11111111-1111-4111-8111-111111111111'
    await withTenantContext(tenant.id, (tx) =>
      loadAbonadoCredit(tenant.id, staff.id, { abonadoId, amount: 25_000_00, method: 'cash', clientIdempotencyKey: key }, tx),
    )
    const second = await withTenantContext(tenant.id, (tx) =>
      loadAbonadoCredit(tenant.id, staff.id, { abonadoId, amount: 25_000_00, method: 'cash', clientIdempotencyKey: key }, tx),
    )

    expect(second.abonado.creditBalance).toBe(25_000_00)
    expect(await countAbonadoPaymentCashflows(tenant.id, abonadoId)).toBe(1)
  })

  it('descuento semanal ("Mantener saldo"): descuenta sin generar CashFlow, idempotente, reversible', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const abonadoId = await insertAbonado({ tenantId: tenant.id, courtId, playerId: player.id, pricePerSession: 10_000_00 })
    const bookingId = await insertFixedBooking({ tenantId: tenant.id, courtId, playerId: player.id, abonadoId, price: 10_000_00 })

    await withTenantContext(tenant.id, (tx) =>
      loadAbonadoCredit(tenant.id, staff.id, { abonadoId, amount: 30_000_00, method: 'cash' }, tx),
    )
    const cashflowsBefore = await countAbonadoPaymentCashflows(tenant.id, abonadoId)

    // Destildar "Mantener saldo" → descuenta price_snapshot (10.000) del saldo.
    const applied = await withTenantContext(tenant.id, (tx) =>
      setBookingAbonadoCredit(tenant.id, staff.id, bookingId, false, tx),
    )
    expect(applied.creditApplied).toBe(10_000_00)
    expect(applied.abonado.creditBalance).toBe(20_000_00)
    // NO genera un CashFlow nuevo (la plata ya entró al cargar el saldo).
    expect(await countAbonadoPaymentCashflows(tenant.id, abonadoId)).toBe(cashflowsBefore)

    // Aplicar de nuevo es idempotente (no descuenta dos veces).
    const again = await withTenantContext(tenant.id, (tx) =>
      setBookingAbonadoCredit(tenant.id, staff.id, bookingId, false, tx),
    )
    expect(again.abonado.creditBalance).toBe(20_000_00)

    // Re-tildar "Mantener saldo" → devuelve el saldo.
    const reverted = await withTenantContext(tenant.id, (tx) =>
      setBookingAbonadoCredit(tenant.id, staff.id, bookingId, true, tx),
    )
    expect(reverted.creditApplied).toBe(0)
    expect(reverted.abonado.creditBalance).toBe(30_000_00)
  })

  it('rechaza descuento si el saldo no alcanza', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const abonadoId = await insertAbonado({ tenantId: tenant.id, courtId, playerId: player.id, pricePerSession: 10_000_00 })
    const bookingId = await insertFixedBooking({ tenantId: tenant.id, courtId, playerId: player.id, abonadoId, price: 10_000_00 })

    // Sin cargar saldo → credit_balance 0 < price.
    await expect(
      withTenantContext(tenant.id, (tx) =>
        setBookingAbonadoCredit(tenant.id, staff.id, bookingId, false, tx),
      ),
    ).rejects.toBeInstanceOf(InsufficientCreditError)
  })

  it('rechaza descuento sobre un turno que no es fijo de abonado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const spontaneousId = await sql<{ id: string }[]>`
      INSERT INTO bookings (tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at, type, status, price_snapshot, deposit_amount, deposit_status, payment_method)
      VALUES (
        ${tenant.id}, ${courtId}, ${player.id}, ${FUTURE_DATE}::date, ${'10:00'}::time, ${'11:00'}::time,
        (${FUTURE_DATE}::date + ${'10:00'}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${FUTURE_DATE}::date + ${'11:00'}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        'spontaneous', 'confirmed', ${10_000_00}, 0, 'not_required', NULL
      )
      RETURNING id
    `.then((r) => r[0]!.id)

    await expect(
      withTenantContext(tenant.id, (tx) =>
        setBookingAbonadoCredit(tenant.id, staff.id, spontaneousId, false, tx),
      ),
    ).rejects.toBeInstanceOf(CreditNotApplicableError)
  })
})

describe('Tarea #9 — Cobro de deuda del jugador', () => {
  it('reduce el balance deudor y registra un CashFlow income', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`UPDATE player_tenant_relationships SET balance = ${55_000_00} WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}`

    const res = await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash' }, tx),
    )
    expect(res.newBalance).toBe(35_000_00)
    expect(res.cashFlow.type).toBe('income')
    expect(res.cashFlow.amount).toBe(20_000_00)
    expect(await readBalance(tenant.id, player.id)).toBe(35_000_00)

    // Pago total restante → balance 0.
    const res2 = await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 35_000_00, method: 'transfer' }, tx),
    )
    expect(res2.newBalance).toBe(0)
  })

  it('idempotencia: la misma clave no descuenta el balance dos veces', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`UPDATE player_tenant_relationships SET balance = ${50_000_00} WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}`

    const key = '22222222-2222-4222-8222-222222222222'
    await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash', clientIdempotencyKey: key }, tx),
    )
    const second = await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash', clientIdempotencyKey: key }, tx),
    )
    expect(second.newBalance).toBe(30_000_00)
    expect(await readBalance(tenant.id, player.id)).toBe(30_000_00)
  })

  it('rechaza pago que supera la deuda', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`UPDATE player_tenant_relationships SET balance = ${10_000_00} WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}`

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash' }, tx),
      ),
    ).rejects.toBeInstanceOf(DebtOverpaymentError)
  })

  it('rechaza cobro si el jugador no tiene deuda', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id) // balance default 0

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 5_000_00, method: 'cash' }, tx),
      ),
    ).rejects.toBeInstanceOf(NoDebtError)
  })
})
