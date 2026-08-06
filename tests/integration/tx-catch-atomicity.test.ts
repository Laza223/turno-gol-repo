import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { artDateOf } from '@/shared/time/art-date'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// H2 (D4, commit 40a5a64): completeAndChargeBookingAction y chargeDebtAction
// atrapaban errores de dominio DENTRO del callback de withTenantContext y
// devolvían {success:false} sin re-lanzar — eso hace que drizzle COMMITEE la
// tx tal cual estaba en el momento del throw (rollback evitado). El fix mueve
// el catch AFUERA: el error de dominio escapa, drizzle hace rollback real, y
// recién ahí se mapea a un mensaje amigable. Los unit tests mockean
// withTenantContext sin tx real, así que no pueden observar commit-parcial
// vs rollback — esto exige DB real (Postgres local, puerto 54322).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))

import { requireOperatorStaff } from '@/modules/staff/guards'
import { completeAndChargeBookingAction } from '@/app/(admin)/reservas/actions'
import { chargeDebtAction } from '@/app/(admin)/caja/deudas/actions'

function asStaff(tenantId: string, staffUserId: string): void {
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId },
    tenant: { id: tenantId },
  } as never)
}

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Atomicidad'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 10_00 }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

// Booking ya terminado (ends_at en el pasado, 2020) para pasar el guard
// BookingNotYetEndedError de completeBooking (admin actor).
async function insertBookingRow(opts: {
  tenantId: string
  courtId: string
  playerId: string
  priceSnapshot: number
  status: 'confirmed' | 'completed'
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
      ${'2020-01-01'}::date, ${'10:00'}::time, ${'11:00'}::time,
      ${'2020-01-01 10:00:00-03'}::timestamptz,
      ${'2020-01-01 11:00:00-03'}::timestamptz,
      ${opts.priceSnapshot}, 0, 'not_required', NULL, ${opts.status}
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function countCashFlows(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM cash_flows WHERE booking_id = ${bookingId}
  `
  return Number(rows[0]!.c)
}

async function bookingStatus(bookingId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.status
}

beforeAll(async () => {
  await ensureRoles()
})
beforeEach(async () => {
  vi.clearAllMocks()
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('completeAndChargeBookingAction — rollback total ante error de dominio post-complete (H2)', () => {
  it('totalCharging > pending DESPUÉS de completeBooking: el booking NO queda completed y no hay cash_flows', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertBookingRow({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      priceSnapshot: 100_00,
      status: 'confirmed',
    })
    asStaff(tenant.id, staff.id)

    // Paso 1 de la action (completeBooking) YA corrió y escribió
    // status='completed' ANTES de este check (paso 2). Con el catch viejo
    // (adentro del callback, sin re-lanzar) esa escritura commiteaba igual
    // aunque la action devolviera success:false.
    const res = await completeAndChargeBookingAction({
      bookingId,
      charges: [{ amount: 200_00, method: 'cash' }],
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/supera lo pendiente/i)

    expect(await bookingStatus(bookingId)).toBe('confirmed')
    expect(await countCashFlows(bookingId)).toBe(0)
  })
})

// LIMITACIÓN CONOCIDA (documentada, no oculta): a diferencia de
// completeAndChargeBookingAction (que SÍ tiene un write previo —
// completeBooking — que sobrevive con el bug viejo), chargeDebtAction no
// tiene NINGÚN write antes del loop de charges. Su ÚNICO write es
// createCashFlow, y `assertDayOpen` toma un advisory lock por-tenant que se
// sostiene durante TODA la tx — así que, DENTRO de una misma invocación,
// "día cerrado" es todo-o-nada para todas las líneas del loop: nunca hay un
// primer createCashFlow exitoso seguido de un segundo que falle. Se probó
// empíricamente forzar ese escenario (2 charges + INSERT directo a
// daily_cash_closes desde otra conexión, sin pasar por el advisory lock, con
// distintos delays) — la ventana donde "sobrevive 1 cash_flow" existe pero
// es de pocos milisegundos y no monotónica (0ms y 10ms cazaban el commit
// parcial, 5ms daba 0 cash_flows, 20/40ms daba 2) — inviable como test
// determinístico, se descartó. Con el trigger simple de abajo (día YA
// cerrado ANTES de invocar la action), el resultado observable es IDÉNTICO
// entre el shape viejo y el nuevo (0 cash_flows, mismo mensaje) — verificado
// corriendo este test contra el shape pre-40a5a64: pasa en ambos casos. Este
// test por lo tanto NO tiene control positivo que lo distinga del bug — sólo
// confirma que el comportamiento post-fix es el correcto. La regla de la
// clase (catch afuera) sigue siendo la protección correcta si en el futuro
// se agrega algún write antes del loop.
describe('chargeDebtAction — rollback total ante error de dominio (H2)', () => {
  it('caja cerrada: no hay cash_flows nuevos y el estado del booking queda intacto', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertBookingRow({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      priceSnapshot: 100_00,
      status: 'completed',
    })

    // Cierra la caja de HOY (misma fecha ART que usará assertDayOpen vía
    // occurredAt = new Date() dentro de createCashFlow).
    await sql`
      INSERT INTO daily_cash_closes (tenant_id, date, closed_by)
      VALUES (${tenant.id}, ${artDateOf(new Date())}::date, ${staff.id})
    `
    asStaff(tenant.id, staff.id)

    const res = await chargeDebtAction({
      bookingId,
      charges: [{ amount: 50_00, method: 'cash' }],
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/caja de hoy ya está cerrada/i)

    expect(await bookingStatus(bookingId)).toBe('completed')
    expect(await countCashFlows(bookingId)).toBe(0)
  })
})
