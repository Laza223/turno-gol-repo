import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { getBookingCharges } from '@/app/(admin)/reservas/queries'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Cobros'}, ${10},
      ${sql.json({ rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', price: 800000 }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  timeStart: string
  timeEnd: string
  price: number
  depositStatus?: string
  depositAmount?: number
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${FUTURE_DATE}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${opts.price}, ${opts.depositAmount ?? 0}, ${opts.depositStatus ?? 'not_required'}, NULL, 'confirmed'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function rawCashFlow(id: string) {
  const sql = getSql()
  const rows = await sql<
    { type: string; category: string; booking_id: string | null; amount: string }[]
  >`SELECT type, category, booking_id, amount::text AS amount FROM cash_flows WHERE id = ${id}`
  return rows[0]!
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('Tarea #8 — cobros de turno vinculados al booking', () => {
  it('registra cobros parciales como cash_flows income/booking y suma el saldo pendiente', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '10:00',
      timeEnd: '11:00',
      price: 55_000_00,
      depositStatus: 'paid',
      depositAmount: 16_500_00,
    })

    // Dos cobros parciales en el mostrador: $20.000 + $18.500.
    const cf1 = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staff.id,
        { type: 'income', category: 'booking', amount: 20_000_00, method: 'cash', description: 'Cobro de turno', bookingId },
        tx,
      ),
    )
    await withTenantContext(tenant.id, (tx) =>
      createCashFlow(
        tenant.id,
        staff.id,
        { type: 'income', category: 'booking', amount: 18_500_00, method: 'transfer', description: 'Cobro de turno', bookingId },
        tx,
      ),
    )

    // El cobro queda vinculado al booking con type income / category booking.
    const stored = await rawCashFlow(cf1.id)
    expect(stored.type).toBe('income')
    expect(stored.category).toBe('booking')
    expect(stored.booking_id).toBe(bookingId)

    const charges = await withTenantContext(tenant.id, (tx) =>
      getBookingCharges(tenant.id, bookingId, tx),
    )
    expect(charges.charges).toHaveLength(2)
    expect(charges.chargesTotal).toBe(38_500_00)

    // Seña ($16.500) + cobros ($38.500) = precio ($55.000) → pendiente 0.
    const summary = summarizeBookingCharges({
      priceSnapshot: 55_000_00,
      depositAmount: 16_500_00,
      depositStatus: 'paid',
      chargesTotal: charges.chargesTotal,
    })
    expect(summary.totalPaid).toBe(55_000_00)
    expect(summary.pending).toBe(0)
  })

  it('getBookingCharges aísla por booking: ignora cobros de otros turnos y egresos', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingA = await insertBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      timeStart: '12:00', timeEnd: '13:00', price: 50_000_00,
    })
    const bookingB = await insertBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      timeStart: '13:00', timeEnd: '14:00', price: 50_000_00,
    })

    await withTenantContext(tenant.id, async (tx) => {
      // Cobro del booking A.
      await createCashFlow(tenant.id, staff.id, { type: 'income', category: 'booking', amount: 30_000_00, method: 'cash', description: 'Cobro de turno', bookingId: bookingA }, tx)
      // Cobro de OTRO booking (B): no debe contar para A.
      await createCashFlow(tenant.id, staff.id, { type: 'income', category: 'booking', amount: 50_000_00, method: 'cash', description: 'Cobro de turno', bookingId: bookingB }, tx)
      // Ingreso de caja sin booking (cantina): no debe contar.
      await createCashFlow(tenant.id, staff.id, { type: 'income', category: 'other', amount: 9_000_00, method: 'cash', description: 'gaseosa' }, tx)
    })

    const charges = await withTenantContext(tenant.id, (tx) =>
      getBookingCharges(tenant.id, bookingA, tx),
    )
    expect(charges.charges).toHaveLength(1)
    expect(charges.chargesTotal).toBe(30_000_00)
  })
})
