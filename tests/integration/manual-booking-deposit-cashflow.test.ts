import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { confirmManualDepositPayment } from '@/modules/payments/payment.service'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { getBookingCharges } from '@/app/(admin)/reservas/queries'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { depositEnteredAsAdjustment } from '@/modules/cashflow/cashflow.service'
import { openDay } from '@/modules/cashflow/cash-open.service'
import { todayART } from '@/shared/time/art-date'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// El bug: `createManualBooking` insertaba la reserva con deposit_status='paid' y
// el monto de la seña, pero NUNCA creaba la fila en cash_flows. La otra puerta
// al mismo estado (`confirmManualDepositPayment`, cuando el staff confirma una
// seña que estaba pendiente) sí la creaba. Consecuencia: el cierre diario
// calcula expectedCash = openingCash + neto de cash_flows, así que el encargado
// contaba MÁS efectivo del esperado y daily_cash_closes.diff_amount archivaba
// una diferencia positiva fantasma — irrecuperable, porque el cierre es historia
// contable y no una vista.
//
// Preexistente, pero los chips de seña del popover de alta rápida (Fase 3) lo
// volvieron el camino principal de cobro en el mostrador.

const PRICE = 1_000_000
const DEPOSIT = 240_000

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: PRICE,
    },
  ],
}

// Futura a propósito: la reserva es para el 2027, pero el cash_flow se imputa a
// HOY (occurredAt = ahora), que es cuando el staff cobró la plata de verdad.
const FUTURE_DATE = '2027-08-20'
const TODAY = todayART()

async function seed() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, ${'Cancha Seña Mostrador'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return { tenantId: tenant.id, staffId: staff.id, courtId: rows[0]!.id }
}

type ManualInput = Parameters<typeof createManualBooking>[1]

function manualInput(opts: {
  courtId: string
  staffId: string
  timeStart: string
  timeEnd: string
  depositAmount?: number
  depositMethod?: ManualInput['depositMethod']
  depositStatus?: ManualInput['depositStatus']
}): ManualInput {
  return {
    courtId: opts.courtId,
    date: FUTURE_DATE,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    type: 'spontaneous',
    staffUserId: opts.staffId,
    guestName: 'Cliente Mostrador',
    ...(opts.depositAmount !== undefined ? { depositAmount: opts.depositAmount } : {}),
    ...(opts.depositMethod !== undefined ? { depositMethod: opts.depositMethod } : {}),
    ...(opts.depositStatus !== undefined ? { depositStatus: opts.depositStatus } : {}),
  }
}

async function cashFlowsFor(bookingId: string) {
  const sql = getSql()
  return sql<
    Array<{ method: string; amount: number; type: string; category: string; description: string }>
  >`
    SELECT method, amount, type, category, description
    FROM cash_flows WHERE booking_id = ${bookingId}
  `
}

async function bookingRow(bookingId: string) {
  const sql = getSql()
  const rows = await sql<
    Array<{
      payment_method: string | null
      deposit_status: string
      deposit_amount: number
      status: string
    }>
  >`
    SELECT payment_method, deposit_status, deposit_amount, status
    FROM bookings WHERE id = ${bookingId}
  `
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

describe('createManualBooking — la seña cobrada en el mostrador entra a Caja', () => {
  it('efectivo: crea exactamente 1 cash_flow income/booking con la descripción canónica', async () => {
    const { tenantId, staffId, courtId } = await seed()

    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '09:00',
          timeEnd: '10:00',
          depositAmount: DEPOSIT,
          depositMethod: 'cash',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    const flows = await cashFlowsFor(booking.id)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      type: 'income',
      category: 'booking',
      method: 'cash',
      amount: DEPOSIT,
    })
    // El literal EXACTO importa: es el marcador por el que getBookingCharges
    // excluye esta fila para no contar la seña dos veces.
    expect(flows[0]!.description).toBe(`Seña — turno ${booking.id}`)

    // Control del aviso al encargado: con la caja ABIERTA no hay nada que
    // avisar. Sin este caso, un lector que devolviera true siempre pasaría.
    await expect(
      withTenantContext(tenantId, (tx) => depositEnteredAsAdjustment(tenantId, booking.id, tx)),
    ).resolves.toBe(false)
  })

  it('mercadopago: bookings.payment_method sigue NULL (contrato INV4) pero el cash_flow guarda el medio real', async () => {
    const { tenantId, staffId, courtId } = await seed()

    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '10:00',
          timeEnd: '11:00',
          depositAmount: DEPOSIT,
          depositMethod: 'mercadopago',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    // chk_booking_payment_consistency exige payment_id NOT NULL para
    // payment_method='mercadopago', y en el alta manual no hay fila `payments`.
    // Por eso la columna queda NULL y el único rastro del medio real es el
    // cash_flow. Un fix que leyera created.paymentMethod violaría el NOT NULL
    // de cash_flows.method y se llevaría puesta la reserva entera.
    const row = await bookingRow(booking.id)
    expect(row.payment_method).toBeNull()
    expect(row.deposit_status).toBe('paid')

    const flows = await cashFlowsFor(booking.id)
    expect(flows).toHaveLength(1)
    expect(flows[0]!.method).toBe('mercadopago')
  })

  it('transferencia: entra a Caja pero NO mueve el efectivo esperado del cierre', async () => {
    const { tenantId, staffId, courtId } = await seed()

    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '11:00',
          timeEnd: '12:00',
          depositAmount: DEPOSIT,
          depositMethod: 'transfer',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    const flows = await cashFlowsFor(booking.id)
    expect(flows).toHaveLength(1)
    expect(flows[0]!.method).toBe('transfer')

    const close = await withTenantContext(tenantId, (tx) =>
      closeDailyRegister(tenantId, TODAY, staffId, { declaredCash: 0 }, 0, tx),
    )
    // cashNet solo suma method='cash': la transferencia entra al balance pero
    // no al cajón.
    expect(close.expectedCash).toBe(0)
    expect(close.diffAmount).toBe(0)
    expect(close.totalIncome).toBe(DEPOSIT)
  })

  it('no infla el cobrado del turno: getBookingCharges excluye la fila de la seña', async () => {
    const { tenantId, staffId, courtId } = await seed()

    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '12:00',
          timeEnd: '13:00',
          depositAmount: DEPOSIT,
          depositMethod: 'cash',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    const charges = await withTenantContext(tenantId, (tx) =>
      getBookingCharges(tenantId, booking.id, tx),
    )
    expect(charges.chargesTotal).toBe(0)

    // La seña se cuenta UNA vez, por depositCounted. Si la descripción del
    // cash_flow no fuera la canónica, chargesTotal la sumaría de nuevo y el
    // pendiente se desplomaría (y con él, la alarma "Sin cobrar" de la grilla).
    const summary = summarizeBookingCharges({
      priceSnapshot: booking.priceSnapshot,
      depositAmount: booking.depositAmount,
      depositStatus: booking.depositStatus,
      chargesTotal: charges.chargesTotal,
    })
    expect(summary.totalPaid).toBe(DEPOSIT)
    expect(summary.pending).toBe(PRICE - DEPOSIT)
  })

  it('deposit_status=paid con monto 0: la reserva se crea igual y no hay cash_flow', async () => {
    const { tenantId, staffId, courtId } = await seed()

    // chk_cashflow_amount_positive rechaza amount = 0, y una violación de CHECK
    // aborta la transacción ENTERA: sin el guard, este alta perdería la reserva.
    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '13:00',
          timeEnd: '14:00',
          depositMethod: 'cash',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    const row = await bookingRow(booking.id)
    expect(row.status).toBe('confirmed')
    expect(row.deposit_amount).toBe(0)
    expect(await cashFlowsFor(booking.id)).toHaveLength(0)
  })

  it('seña PENDIENTE: no toca Caja — la plata todavía no llegó', async () => {
    const { tenantId, staffId, courtId } = await seed()

    // El estado que decide si hay fila en cash_flows es EXACTAMENTE el mismo
    // que usa `summarizeBookingCharges` para contar la seña como cobrada
    // (paid | captured). Una seña `pending` es una promesa, no un ingreso: si
    // entrara a Caja, el cierre esperaría efectivo que nadie puso en el cajón —
    // el bug espejo del que este esfuerzo vino a arreglar.
    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '18:00',
          timeEnd: '19:00',
          depositAmount: DEPOSIT,
          depositMethod: 'cash',
          depositStatus: 'pending',
        }),
        tx,
      ),
    )

    const row = await bookingRow(booking.id)
    expect(row.deposit_status).toBe('pending')
    expect(await cashFlowsFor(booking.id)).toHaveLength(0)
  })

  it('sin seña: no toca Caja', async () => {
    const { tenantId, staffId, courtId } = await seed()

    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({ courtId, staffId, timeStart: '14:00', timeEnd: '15:00' }),
        tx,
      ),
    )

    const row = await bookingRow(booking.id)
    expect(row.deposit_status).toBe('not_required')
    expect(await cashFlowsFor(booking.id)).toHaveLength(0)
  })

  it('caja ya cerrada: la seña entra como AJUSTE y se le avisa al dueño por mail', async () => {
    const sql = getSql()
    const { tenantId, staffId, courtId } = await seed()

    await withTenantContext(tenantId, (tx) =>
      closeDailyRegister(tenantId, TODAY, staffId, { declaredCash: 0 }, 0, tx),
    )

    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '15:00',
          timeEnd: '16:00',
          depositAmount: DEPOSIT,
          depositMethod: 'cash',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    // La plata YA la cobró el staff en la realidad: jamás vale la pena perder
    // la reserva por un problema de atribución contable secundaria.
    const row = await bookingRow(booking.id)
    expect(row.status).toBe('confirmed')
    expect(row.deposit_status).toBe('paid')

    // 🔴 QA 2026-08-28 F-02: antes acá no se escribía NADA en Caja. La reserva
    // decía "pagada" y esos pesos no figuraban en ninguna vista, así que la
    // conciliación del día quedaba corta sin que nadie lo notara. Ahora entran
    // como ajuste del mismo día operativo — 'other' porque el CHECK de DB no
    // admite 'booking' con type 'adjustment'.
    const flows = await cashFlowsFor(booking.id)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      type: 'adjustment',
      category: 'other',
      amount: DEPOSIT,
      method: 'cash',
    })
    // Mismo literal que el camino feliz: getBookingCharges lo excluye por
    // string, así que la seña no se cuenta dos veces en el cobrado del turno.
    expect(flows[0]!.description).toBe(`Seña — turno ${booking.id}`)

    // El snapshot del cierre NO se toca: sigue siendo la foto de lo contado esa
    // noche. El ajuste se ve aparte, no reescribe el cierre.
    const closes = await sql<Array<{ declared_cash: number; diff_amount: number }>>`
      SELECT declared_cash, diff_amount FROM daily_cash_closes
      WHERE tenant_id = ${tenantId} AND date = ${TODAY}
    `
    expect(closes).toHaveLength(1)
    expect(closes[0]!.declared_cash).toBe(0)
    expect(closes[0]!.diff_amount).toBe(0)

    const notifs = await sql<Array<{ template_name: string; status: string }>>`
      SELECT template_name, status FROM notifications
      WHERE tenant_id = ${tenantId} AND template_name = 'admin_deposit_after_close'
    `
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.status).toBe('queued')

    // La señal que `createBookingAction` le muestra al encargado en el toast.
    // Se lee la fila escrita, no se predice: por eso el aviso no puede mentir
    // aunque alguien cierre la caja en el medio.
    await expect(
      withTenantContext(tenantId, (tx) => depositEnteredAsAdjustment(tenantId, booking.id, tx)),
    ).resolves.toBe(true)
  })

  it('el cierre del día cuadra: expected = fondo + seña, diferencia 0', async () => {
    const { tenantId, staffId, courtId } = await seed()
    const OPENING = 500_000

    await withTenantContext(tenantId, (tx) =>
      openDay(tenantId, staffId, { date: TODAY, openingCash: OPENING }, 0, tx),
    )

    await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '16:00',
          timeEnd: '17:00',
          depositAmount: DEPOSIT,
          depositMethod: 'cash',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    // El encargado cuenta el cajón: fondo + la seña que cobró. Antes del fix,
    // expectedCash era solo el fondo y el cierre archivaba +DEPOSIT de sobrante
    // fantasma.
    const close = await withTenantContext(tenantId, (tx) =>
      closeDailyRegister(tenantId, TODAY, staffId, { declaredCash: OPENING + DEPOSIT }, 0, tx),
    )
    expect(close.openingCash).toBe(OPENING)
    expect(close.expectedCash).toBe(OPENING + DEPOSIT)
    expect(close.diffAmount).toBe(0)
  })

  it('no se puede cobrar dos veces: confirmar la seña después no agrega un segundo cash_flow', async () => {
    const { tenantId, staffId, courtId } = await seed()

    const booking = await withTenantContext(tenantId, (tx) =>
      createManualBooking(
        tenantId,
        manualInput({
          courtId,
          staffId,
          timeStart: '17:00',
          timeEnd: '18:00',
          depositAmount: DEPOSIT,
          depositMethod: 'cash',
          depositStatus: 'paid',
        }),
        tx,
      ),
    )

    // La garantía es INDIRECTA y por eso se testea: el alta manual nace
    // status='confirmed', y confirmManualDepositPayment exige 'pending_payment'
    // vía transitionFromPendingPayment. No hay UNIQUE ni idempotency key que
    // frene el doble cash_flow — solo la máquina de estados. Si algún día el
    // alta manual pudiera nacer pending_payment, este test se pone rojo.
    const outcome = await withTenantContext(tenantId, (tx) =>
      confirmManualDepositPayment(booking.id, 'cash', staffId, tenantId, tx),
    )
    expect(outcome.won).toBe(false)
    expect(await cashFlowsFor(booking.id)).toHaveLength(1)
  })
})
