import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { confirmManualDepositPayment } from '@/modules/payments/payment.service'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { getBookingCharges } from '@/app/(admin)/reservas/queries'
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

  it('transferencia: entra a Caja con el método correcto', async () => {
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
