import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { getBookingCharges } from '@/app/(admin)/reservas/queries'
import { depositCashFlowDescription, summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// Hallazgo C (TOCTOU, ENS-3 real): el test de más abajo ejercita
// addBookingChargeAction COMPLETA (guard real + rate limit real + FOR UPDATE
// lock) en vez de reimplementar el patrón transaccional aparte — así se
// prueba el código de producción tal cual lo llama la UI, no una copia que
// podría divergir del original con el próximo cambio. Se mockea solo el
// borde de sesión (extractAuthUser/getStaffTenant), mismo patrón que
// tests/integration/staff-actions.test.ts: requireOperatorStaff sigue
// leyendo el rol real desde tenant_staff_members (DB real, sin RLS local
// porque el DSN de test es superusuario) y withTenantContext/createCashFlow/
// getBookingCharges corren contra Postgres real. adminRateLimited también
// corre sin mockear: sin credenciales de Upstash en el entorno de test,
// enforce() cae al catch y falla abierto (policy adminCrud, failMode='open'),
// así que no interfiere con las dos llamadas concurrentes.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { addBookingChargeAction } from '@/app/(admin)/reservas/actions'

function asStaff(tenantId: string, staffUserId: string): void {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'owner@test.local',
    staffUserId,
    tenantId,
    role: 'admin',
  })
  vi.mocked(getStaffTenant).mockResolvedValue({ id: tenantId, status: 'active' } as never)
}

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

  // ENS-21 (f): el cash_flow automático de la seña (handleApproved,
  // payment.service.ts) usa category='booking' igual que un cobro de
  // mostrador — sin excluirlo, getBookingCharges lo sumaría de nuevo sobre
  // depositCounted (que ya cuenta la seña vía deposit_status/deposit_amount),
  // duplicando el pendiente. Simula el insert automático (misma description
  // determinística que produce handleApproved) y verifica que
  // getBookingCharges lo excluye tanto de `charges` como de `chargesTotal`.
  it('excluye el cash_flow automático de la seña MP de "cobros de mostrador" (no duplica el pendiente)', async () => {
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
      timeStart: '15:00',
      timeEnd: '16:00',
      price: 55_000_00,
      depositStatus: 'paid',
      depositAmount: 16_500_00,
    })

    await withTenantContext(tenant.id, async (tx) => {
      // El cash_flow automático de la seña — misma forma que inserta
      // recordDepositCashFlow en handleApproved.
      await createCashFlow(
        tenant.id,
        staff.id,
        {
          type: 'income',
          category: 'booking',
          amount: 16_500_00,
          method: 'mercadopago',
          description: depositCashFlowDescription(bookingId),
          bookingId,
        },
        tx,
      )
      // Un cobro de mostrador real, que SÍ debe contar.
      await createCashFlow(
        tenant.id,
        staff.id,
        { type: 'income', category: 'booking', amount: 20_000_00, method: 'cash', description: 'Cobro de turno', bookingId },
        tx,
      )
    })

    const charges = await withTenantContext(tenant.id, (tx) =>
      getBookingCharges(tenant.id, bookingId, tx),
    )
    // Solo el cobro de mostrador entra en la lista/el total — la seña queda afuera.
    expect(charges.charges).toHaveLength(1)
    expect(charges.chargesTotal).toBe(20_000_00)

    // Seña ($16.500, vía deposit_status) + cobro de mostrador ($20.000) =
    // $36.500 pagado; pendiente = 55.000 - 36.500 = 18.500. Si la seña se
    // hubiera duplicado, chargesTotal sería 36.500 y el pendiente daría 0.
    const summary = summarizeBookingCharges({
      priceSnapshot: 55_000_00,
      depositAmount: 16_500_00,
      depositStatus: 'paid',
      chargesTotal: charges.chargesTotal,
    })
    expect(summary.totalPaid).toBe(36_500_00)
    expect(summary.pending).toBe(18_500_00)
  })
})

describe('Hallazgo C — TOCTOU de cobros concurrentes (addBookingChargeAction, FOR UPDATE serializa)', () => {
  it('dos cobros que individualmente caben pero juntos superan el pendiente: exactamente uno gana', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    // Turno de $10.000 sin seña. Cada cobro de $8.000 cabe individualmente
    // (8.000 <= 10.000 pendiente) pero la SUMA de los dos ($16.000) supera el
    // precio. Sin el FOR UPDATE (Hallazgo C), ambos leerían pending=10.000
    // en paralelo y los dos pasarían la validación.
    const bookingId = await insertBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '19:00',
      timeEnd: '20:00',
      price: 10_000_00,
    })

    asStaff(tenant.id, staff.id)

    const [r1, r2] = await Promise.all([
      addBookingChargeAction({ bookingId, amount: 8_000_00, method: 'cash' }),
      addBookingChargeAction({ bookingId, amount: 8_000_00, method: 'cash' }),
    ])

    const results = [r1, r2]
    const winners = results.filter((r) => r.success)
    const losers = results.filter((r) => !r.success)

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    const loser = losers[0] as { success: false; error: string }
    expect(loser.error).toContain('supera lo pendiente')

    // Solo UN cash_flow income/booking quedó insertado para este booking — el
    // perdedor no dejó fila huérfana ni se coló por la carrera.
    const cashFlows = await sql<{ c: string }[]>`
      SELECT COUNT(*)::text AS c FROM cash_flows
      WHERE booking_id = ${bookingId} AND type = 'income' AND category = 'booking'
    `
    expect(Number(cashFlows[0]!.c)).toBe(1)
  })
})
