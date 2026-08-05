import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createProduct } from '@/modules/canteen/canteen.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { SaleBookingNotFoundError } from '@/modules/canteen/canteen.errors'
import { getBookingCharges, sumBookingChargesByBooking } from '@/app/(admin)/reservas/queries'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * Cantina cargada a un turno (Fase 3, T5): la venta lleva `booking_id` pero
 * SIGUE siendo `income`/`product_sale`.
 *
 * El riesgo real de esta feature no es que la venta falle — es que funcione y
 * que la plata se cuente dos veces. Un cash_flow con `booking_id` parece un
 * pago del turno para cualquier query que filtre sólo por esa columna: una
 * cerveza de $2.000 bajaría en $2.000 lo que el cliente debe por la cancha, y
 * la alarma "terminado sin cobrar" se apagaría sola. Por eso estos tests miran
 * el SALDO del turno, no la venta.
 */

const FUTURE_DATE = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const PRICE = 2_400_00 // $2.400 en centavos

let tenantId: string
let otherTenantId: string
let staffUserId: string
let playerId: string
let courtId: string
let productId: string

async function insertCourt(tid: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, status)
    VALUES (${tid}, ${'Cancha Cantina'}, ${10}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(tid: string, cid: string, timeStart: string): Promise<string> {
  const sql = getSql()
  const endHour = String(Number(timeStart.slice(0, 2)) + 1).padStart(2, '0')
  const timeEnd = `${endHour}:00`
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, price_snapshot, deposit_amount, deposit_status,
      payment_method, status
    ) VALUES (
      ${tid}, ${cid}, ${playerId},
      ${FUTURE_DATE}::date, ${timeStart}::time, ${timeEnd}::time,
      (${FUTURE_DATE}::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${PRICE}, 0, 'not_required', NULL, 'confirmed'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function cashFlowOf(cashFlowId: string) {
  const sql = getSql()
  const rows = await sql<
    { booking_id: string | null; category: string; type: string; amount: number }[]
  >`
    SELECT booking_id, category, type, amount FROM cash_flows WHERE id = ${cashFlowId}
  `
  return rows[0]!
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
  const product = await withTenantContext(tenantId, (tx) =>
    createProduct(tenantId, { name: 'Cerveza', price: 200_00, stock: 500 }, tx),
  )
  productId = product.id
}, 40_000)

afterAll(async () => {
  await closeSql()
})

describe('venta de cantina cargada a un turno', () => {
  it('graba el booking_id pero conserva la categoría product_sale', async () => {
    const bookingId = await insertBooking(tenantId, courtId, '08:00')

    const sale = await withTenantContext(tenantId, (tx) =>
      sellTicket(
        tenantId,
        staffUserId,
        {
          lines: [{ productId, qty: 2 }],
          method: 'cash',
          clientIdempotencyKey: crypto.randomUUID(),
          bookingId,
        },
        tx,
      ),
    )

    const cf = await cashFlowOf(sale.cashFlowId)
    expect(cf.booking_id).toBe(bookingId)
    expect(cf.category).toBe('product_sale')
    expect(cf.type).toBe('income')
    expect(cf.amount).toBe(400_00)
  }, 30_000)

  it('🔴 NO baja el saldo del turno: el pendiente sigue siendo el precio entero', async () => {
    const bookingId = await insertBooking(tenantId, courtId, '09:00')

    await withTenantContext(tenantId, (tx) =>
      sellTicket(
        tenantId,
        staffUserId,
        {
          lines: [{ productId, qty: 3 }],
          method: 'cash',
          clientIdempotencyKey: crypto.randomUUID(),
          bookingId,
        },
        tx,
      ),
    )

    const [detalle, batch] = await withTenantContext(tenantId, async (tx) => [
      await getBookingCharges(tenantId, bookingId, tx),
      await sumBookingChargesByBooking(tenantId, [bookingId], tx),
    ])

    expect(detalle.chargesTotal).toBe(0)
    expect(batch.get(bookingId) ?? 0).toBe(0)

    const { totalPaid, pending } = summarizeBookingCharges({
      priceSnapshot: PRICE,
      depositAmount: 0,
      depositStatus: 'not_required',
      chargesTotal: detalle.chargesTotal,
    })
    expect(totalPaid).toBe(0)
    expect(pending).toBe(PRICE)
  }, 30_000)

  it('convive con un cobro real del turno sin mezclarse (control positivo)', async () => {
    const bookingId = await insertBooking(tenantId, courtId, '10:00')

    await withTenantContext(tenantId, (tx) =>
      createCashFlow(
        tenantId,
        staffUserId,
        {
          type: 'income',
          category: 'booking',
          amount: 1_000_00,
          method: 'cash',
          description: 'Cobro de mostrador',
          bookingId,
        },
        tx,
      ),
    )
    await withTenantContext(tenantId, (tx) =>
      sellTicket(
        tenantId,
        staffUserId,
        {
          lines: [{ productId, qty: 1 }],
          method: 'cash',
          clientIdempotencyKey: crypto.randomUUID(),
          bookingId,
        },
        tx,
      ),
    )

    const [detalle, batch] = await withTenantContext(tenantId, async (tx) => [
      await getBookingCharges(tenantId, bookingId, tx),
      await sumBookingChargesByBooking(tenantId, [bookingId], tx),
    ])

    // Sólo el cobro de la cancha; la cerveza no suma ni resta.
    expect(detalle.chargesTotal).toBe(1_000_00)
    expect(batch.get(bookingId)).toBe(1_000_00)
  }, 30_000)

  it('rechaza un turno de OTRO complejo: el FK no ve RLS, la validación sí', async () => {
    const otherCourtId = await insertCourt(otherTenantId)
    const foreignBookingId = await insertBooking(otherTenantId, otherCourtId, '11:00')

    await expect(
      withTenantContext(tenantId, (tx) =>
        sellTicket(
          tenantId,
          staffUserId,
          {
            lines: [{ productId, qty: 1 }],
            method: 'cash',
            clientIdempotencyKey: crypto.randomUUID(),
            bookingId: foreignBookingId,
          },
          tx,
        ),
      ),
    ).rejects.toThrow(SaleBookingNotFoundError)

    // Y el rechazo tiene que ser ATÓMICO: ni cash_flow ni movimiento de stock.
    const sql = getSql()
    const leaked = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM cash_flows WHERE booking_id = ${foreignBookingId}
    `
    expect(leaked[0]!.n).toBe(0)
  }, 30_000)

  it('sin bookingId la venta sigue funcionando igual (control negativo)', async () => {
    const sale = await withTenantContext(tenantId, (tx) =>
      sellTicket(
        tenantId,
        staffUserId,
        {
          lines: [{ productId, qty: 1 }],
          method: 'cash',
          clientIdempotencyKey: crypto.randomUUID(),
        },
        tx,
      ),
    )
    const cf = await cashFlowOf(sale.cashFlowId)
    expect(cf.booking_id).toBeNull()
    expect(cf.category).toBe('product_sale')
  }, 30_000)
})
