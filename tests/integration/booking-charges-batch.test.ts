import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { getBookingCharges, sumBookingChargesByBooking } from '@/app/(admin)/reservas/queries'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * `sumBookingChargesByBooking` es la versión batch que alimenta el saldo de la
 * grilla (alarma "terminado sin cobrar", Fase 3). Tiene que dar EXACTAMENTE lo
 * mismo que `getBookingCharges` por turno: si divergen, la grilla y el detalle
 * de la reserva muestran plata distinta y no hay forma de saber cuál miente.
 */

const FUTURE_DATE = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

let tenantId: string
let otherTenantId: string
let staffUserId: string
let playerId: string
let courtId: string

async function insertCourt(tid: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, status)
    VALUES (${tid}, ${'Cancha Batch'}, ${10}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(opts: {
  tenantId: string
  courtId: string
  timeStart: string
  timeEnd: string
  price?: number
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, price_snapshot, deposit_amount, deposit_status,
      payment_method, status
    ) VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${FUTURE_DATE}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${opts.price ?? 800000}, 0, 'not_required', NULL, 'confirmed'
    )
    RETURNING id
  `
  return rows[0]!.id
}

function charge(bookingId: string, amount: number, description: string) {
  return withTenantContext(tenantId, (tx) =>
    createCashFlow(
      tenantId,
      staffUserId,
      { type: 'income', category: 'booking', amount, method: 'cash', description, bookingId },
      tx,
    ),
  )
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const other = await createTestTenant(sql)
  otherTenantId = other.id
  const player = await createTestPlayer(sql)
  playerId = player.id
  const staff = await createTestStaffUser(sql)
  staffUserId = staff.id
  await linkStaffToTenant(sql, tenantId, staff.id)
  courtId = await insertCourt(tenantId)
}, 40_000)

afterAll(async () => {
  await closeSql()
})

describe('sumBookingChargesByBooking — saldo batch de la grilla', () => {
  it('suma los cobros de varios turnos en una sola pasada y omite los que no tienen', async () => {
    const a = await insertBooking({ tenantId, courtId, timeStart: '08:00', timeEnd: '09:00' })
    const b = await insertBooking({ tenantId, courtId, timeStart: '09:00', timeEnd: '10:00' })
    const sinCobros = await insertBooking({
      tenantId,
      courtId,
      timeStart: '10:00',
      timeEnd: '11:00',
    })

    await charge(a, 30000, 'Parcial 1')
    await charge(a, 20000, 'Parcial 2')
    await charge(b, 15000, 'Único')

    const map = await withTenantContext(tenantId, (tx) =>
      sumBookingChargesByBooking(tenantId, [a, b, sinCobros], tx),
    )

    expect(map.get(a)).toBe(50000)
    expect(map.get(b)).toBe(15000)
    expect(map.has(sinCobros)).toBe(false)
  }, 30_000)

  it('excluye la fila de la seña, igual que getBookingCharges', async () => {
    const id = await insertBooking({ tenantId, courtId, timeStart: '11:00', timeEnd: '12:00' })
    await charge(id, 24000, depositCashFlowDescription(id))
    await charge(id, 10000, 'Cobro de mostrador')

    const [map, detalle] = await withTenantContext(tenantId, async (tx) => [
      await sumBookingChargesByBooking(tenantId, [id], tx),
      await getBookingCharges(tenantId, id, tx),
    ])

    expect(map.get(id)).toBe(10000)
    expect(detalle.chargesTotal).toBe(10000)
  }, 30_000)

  it('coincide con getBookingCharges turno por turno — grilla y detalle no pueden divergir', async () => {
    const ids: string[] = []
    for (const [i, hora] of ['12:00', '13:00', '14:00'].entries()) {
      const id = await insertBooking({
        tenantId,
        courtId,
        timeStart: hora,
        timeEnd: `${String(Number(hora.slice(0, 2)) + 1).padStart(2, '0')}:00`,
      })
      await charge(id, 1000 * (i + 1), `Cobro ${i}`)
      await charge(id, 500, depositCashFlowDescription(id))
      ids.push(id)
    }

    await withTenantContext(tenantId, async (tx) => {
      const map = await sumBookingChargesByBooking(tenantId, ids, tx)
      for (const id of ids) {
        const detalle = await getBookingCharges(tenantId, id, tx)
        expect(map.get(id) ?? 0).toBe(detalle.chargesTotal)
      }
    })
  }, 40_000)

  it('ignora un cobro de otra categoría con el mismo booking_id (guard de cantina al turno)', async () => {
    const id = await insertBooking({ tenantId, courtId, timeStart: '15:00', timeEnd: '16:00' })
    await charge(id, 12000, 'Cobro del turno')
    await withTenantContext(tenantId, (tx) =>
      createCashFlow(
        tenantId,
        staffUserId,
        {
          type: 'income',
          category: 'product_sale',
          amount: 3000,
          method: 'cash',
          description: 'Cantina: Agua x2',
          bookingId: id,
        },
        tx,
      ),
    )

    const map = await withTenantContext(tenantId, (tx) =>
      sumBookingChargesByBooking(tenantId, [id], tx),
    )

    // La gaseosa NO baja el saldo del turno.
    expect(map.get(id)).toBe(12000)
  }, 30_000)

  it('no cruza tenants', async () => {
    const mio = await insertBooking({ tenantId, courtId, timeStart: '16:00', timeEnd: '17:00' })
    await charge(mio, 7000, 'Cobro propio')

    const map = await withTenantContext(otherTenantId, (tx) =>
      sumBookingChargesByBooking(otherTenantId, [mio], tx),
    )

    expect(map.has(mio)).toBe(false)
  }, 30_000)

  it('con lista vacía no toca la DB y devuelve un map vacío', async () => {
    const map = await withTenantContext(tenantId, (tx) =>
      sumBookingChargesByBooking(tenantId, [], tx),
    )
    expect(map.size).toBe(0)
  }, 20_000)
})
