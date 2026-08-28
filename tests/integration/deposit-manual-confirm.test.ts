import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  createDepositPayment,
  confirmManualDepositPayment,
} from '@/modules/payments/payment.service'
import { cancelByAdmin } from '@/modules/bookings/booking.cancellation'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { todayART } from '@/shared/time/art-date'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// Bug real (confirmado con este mismo test): el jugador arranca un checkout de
// MercadoPago y lo abandona/rechaza — createDepositPayment ya pisó
// bookings.payment_method='mercadopago' + payment_id=<fila payments 'pending',
// nunca 'approved'>. Si el staff después confirma que en realidad cobró en
// efectivo en el mostrador, confirmDepositPaymentAction (antes del fix) solo
// tocaba status/deposit_status vía transitionFromPendingPayment — payment_method
// seguía mintiendo 'mercadopago', payment_id seguía apuntando al pago nunca
// aprobado, y cero cash_flow reflejaba la plata cobrada. Al cancelar después,
// cancelByAdmin/cancelByPlayer veían payment_id + gateway y llamaban
// prepareRefund, que tira RefundInvalidStateError (status='pending' != 'approved')
// sin catch en los callers → excepción cruda.

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

const FUTURE_DATE = '2027-08-20'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Depósito Manual'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertPendingBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  timeStart: string
  timeEnd: string
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
      ${800000}, ${opts.depositAmount ?? 240000},
      'pending', NULL, 'pending_payment'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function getBookingRow(bookingId: string) {
  const sql = getSql()
  const rows = await sql<
    Array<{
      status: string
      payment_method: string | null
      payment_id: string | null
      deposit_status: string
    }>
  >`
    SELECT status, payment_method, payment_id, deposit_status
    FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!
}

async function getCashFlowsForBooking(bookingId: string) {
  const sql = getSql()
  return sql<
    Array<{ method: string; amount: number; type: string; category: string; description: string }>
  >`
    SELECT method, amount, type, category, description
    FROM cash_flows WHERE booking_id = ${bookingId}
  `
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('confirmManualDepositPayment — seña confirmada a mano tras un checkout MP abandonado', () => {
  it('corrige payment_method/payment_id, crea el cash_flow y permite cancelar sin RefundInvalidStateError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const depositAmount = 240_000
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '09:00',
      timeEnd: '10:00',
      depositAmount,
    })

    // El jugador arrancó (y abandonó) un checkout de MP: esto pisa
    // payment_method='mercadopago' + payment_id=<fila payments 'pending'>.
    const gateway = new MockGateway()
    await createDepositPayment(bookingId, gateway, tenant.id, 'https://app.test')

    const beforeConfirm = await getBookingRow(bookingId)
    expect(beforeConfirm.payment_method).toBe('mercadopago')
    expect(beforeConfirm.payment_id).not.toBeNull()

    // El staff confirma que en realidad cobró en efectivo en el mostrador.
    const outcome = await withTenantContext(tenant.id, (tx) =>
      confirmManualDepositPayment(bookingId, 'cash', staff.id, tenant.id, tx),
    )
    expect(outcome.won).toBe(true)
    if (!outcome.won) throw new Error('unreachable')
    expect(outcome.booking.paymentMethod).toBe('cash')
    expect(outcome.booking.paymentId).toBeNull()

    const afterConfirm = await getBookingRow(bookingId)
    expect(afterConfirm.status).toBe('confirmed')
    expect(afterConfirm.deposit_status).toBe('paid')
    expect(afterConfirm.payment_method).toBe('cash')
    expect(afterConfirm.payment_id).toBeNull()

    const cashFlows = await getCashFlowsForBooking(bookingId)
    expect(cashFlows).toHaveLength(1)
    expect(cashFlows[0]).toMatchObject({
      method: 'cash',
      amount: depositAmount,
      type: 'income',
      category: 'booking',
    })

    // Cancelar NO debe tirar RefundInvalidStateError: payment_id ya está NULL
    // (el viejo pago 'pending' de MP quedó desvinculado), así que se resuelve
    // como reembolso offline, sin tocar MP.
    const canceled = await withTenantContext(tenant.id, (tx) =>
      cancelByAdmin(bookingId, staff.id, 'el complejo necesita el turno', 'complejo', tx),
    )
    expect(canceled.booking.status).toBe('canceled_refunded')
    expect(canceled.booking.depositStatus).toBe('refunded')
    // La devolución queda anotada como manual: sin `payment_id` no hay pago
    // original del que colgarse, y de todos modos la plata la mueve el complejo.
  })

  it('won=false cuando el booking ya salió de pending_payment (perdió la carrera) y no crea cash_flow', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '11:00',
      timeEnd: '12:00',
    })
    // Simula que el webhook/cron ya movió el booking fuera de pending_payment.
    await sql`UPDATE bookings SET status = 'expired' WHERE id = ${bookingId}`

    const outcome = await withTenantContext(tenant.id, (tx) =>
      confirmManualDepositPayment(bookingId, 'cash', staff.id, tenant.id, tx),
    )
    expect(outcome.won).toBe(false)
    expect(await getCashFlowsForBooking(bookingId)).toHaveLength(0)
  })
  it('caja ya cerrada: la seña entra como AJUSTE y se le avisa al dueño por mail', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const depositAmount = 240_000
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '13:00',
      timeEnd: '14:00',
      depositAmount,
    })

    // El encargado ya cerró la caja de la noche y después cobra la seña.
    await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(tenant.id, todayART(), staff.id, { declaredCash: 0 }, 0, tx),
    )

    const outcome = await withTenantContext(tenant.id, (tx) =>
      confirmManualDepositPayment(bookingId, 'cash', staff.id, tenant.id, tx),
    )
    expect(outcome.won).toBe(true)
    if (!outcome.won) throw new Error('unreachable')

    const row = await getBookingRow(bookingId)
    expect(row.status).toBe('confirmed')
    expect(row.deposit_status).toBe('paid')

    // 🔴 QA 2026-08-28 F-02, hermana del caso de createManualBooking: acá el
    // agujero seguía abierto después del primer fix. La plata está en el cajón
    // y la reserva dice "pagada": si Caja no la ve, la conciliación del día
    // queda corta y nadie lo nota.
    const flows = await getCashFlowsForBooking(bookingId)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      type: 'adjustment',
      category: 'other',
      method: 'cash',
      amount: depositAmount,
    })
    // Literal canónico: getBookingCharges lo excluye por string exacto.
    expect(flows[0]!.description).toBe(`Seña — turno ${bookingId}`)

    // El snapshot del cierre queda intacto: es la foto de lo que se contó.
    const closes = await sql<Array<{ declared_cash: number; diff_amount: number }>>`
      SELECT declared_cash, diff_amount FROM daily_cash_closes
      WHERE tenant_id = ${tenant.id} AND date = ${todayART()}
    `
    expect(closes).toHaveLength(1)
    expect(closes[0]!.declared_cash).toBe(0)
    expect(closes[0]!.diff_amount).toBe(0)

    const notifs = await sql<Array<{ template_name: string; status: string }>>`
      SELECT template_name, status FROM notifications
      WHERE tenant_id = ${tenant.id} AND template_name = 'admin_deposit_after_close'
    `
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.status).toBe('queued')
    expect(outcome.notificationIds).toHaveLength(1)
  })
})
