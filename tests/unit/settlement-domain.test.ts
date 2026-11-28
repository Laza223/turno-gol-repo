import { describe, expect, it } from 'vitest'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { gridMoneyVisual, gridSlotVisual } from '@/lib/booking/slot-visual'
import { agendaMoneyCell } from '@/app/(admin)/reservas/money-line'
import {
  formatYearMonthEs,
  isValidYearMonth,
  listUpcomingYearMonths,
  resolveMonthlyCoverageBounds,
} from '@/lib/month-bounds'
import {
  settleAbonadoPeriodSchema,
  settleBookingsBatchSchema,
} from '@/modules/settlements/settlement.schema'
import { createMultiDateEventSchema } from '@/modules/bookings/booking.schema'
import {
  createAbonadoSchema,
  updateAbonadoAgreementSchema,
} from '@/modules/abonados/abonado.schema'

const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111'
const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222'

describe('month-bounds', () => {
  it('valida YYYY-MM estrictamente', () => {
    expect(isValidYearMonth('2026-01')).toBe(true)
    expect(isValidYearMonth('2026-12')).toBe(true)
    expect(isValidYearMonth('2026-00')).toBe(false)
    expect(isValidYearMonth('2026-13')).toBe(false)
    expect(isValidYearMonth('2026-1')).toBe(false)
  })

  it('calcula fin de mes considerando febrero y años bisiestos', () => {
    expect(resolveMonthlyCoverageBounds('2026-02').periodEnd).toBe('2026-02-28')
    expect(resolveMonthlyCoverageBounds('2028-02').periodEnd).toBe('2028-02-29')
    expect(resolveMonthlyCoverageBounds('2026-11').periodEnd).toBe('2026-11-30')
  })

  it('acota periodStart cuando startsFromDate cae dentro del mismo mes', () => {
    expect(resolveMonthlyCoverageBounds('2026-11', '2026-11-15')).toEqual({
      periodStart: '2026-11-15',
      periodEnd: '2026-11-30',
    })
    // Si startsFromDate pertenece a otro mes, cubre el mes entero pedido
    expect(resolveMonthlyCoverageBounds('2026-12', '2026-11-15')).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
    })
  })

  it('avanza meses cruzando fin de año y formatea en español', () => {
    expect(formatYearMonthEs('2026-11')).toBe('Noviembre 2026')
    expect(listUpcomingYearMonths('2026-11', 3)).toEqual([
      { value: '2026-11', label: 'Noviembre 2026' },
      { value: '2026-12', label: 'Diciembre 2026' },
      { value: '2027-01', label: 'Enero 2027' },
    ])
  })
})

describe('summarizeBookingCharges con settlementId', () => {
  it('mantiene pendiente 0 si settlementId está presente aunque priceSnapshot sea > 0 y chargesTotal 0', () => {
    const res = summarizeBookingCharges({
      priceSnapshot: 168_000_00,
      depositAmount: 0,
      depositStatus: 'not_required',
      chargesTotal: 0,
      writtenOff: 0,
      settlementId: VALID_UUID_1,
    })
    expect(res.pending).toBe(0)
    expect(res.totalPaid).toBe(0)
  })

  it('calcula pendiente normal cuando settlementId es null', () => {
    const res = summarizeBookingCharges({
      priceSnapshot: 168_000_00,
      depositAmount: 0,
      depositStatus: 'not_required',
      chargesTotal: 0,
      writtenOff: 0,
      settlementId: null,
    })
    expect(res.pending).toBe(168_000_00)
  })
})

describe('visual mapping para mensual y saldado (Grilla & Agenda)', () => {
  it('muestra Saldado en verde cuando settlementId está presente (aún con priceSnapshot = 0)', () => {
    const money = gridMoneyVisual({
      status: 'confirmed',
      type: 'fixed',
      priceSnapshot: 0,
      pending: 0,
      totalPaid: 0,
      settlementId: VALID_UUID_1,
      abonadoBillingMode: 'monthly',
      ended: false,
      started: false,
    })
    expect(money.label).toBe('Saldado')
    expect(money.tone).toBe('success')

    const agenda = agendaMoneyCell(
      {
        status: 'confirmed',
        type: 'fixed',
        priceSnapshot: 0,
        pending: 0,
        totalPaid: 0,
        depositAmount: 0,
        settlementId: VALID_UUID_1,
        abonadoBillingMode: 'monthly',
      },
      true,
    )
    expect(agenda).toEqual({ text: 'Saldado', tone: 'success' })
  })

  it('diferencia abono mensual sin saldar de un turno pago o gratis', () => {
    const futureMonthly = gridMoneyVisual({
      status: 'confirmed',
      type: 'fixed',
      priceSnapshot: 0,
      pending: 0,
      totalPaid: 0,
      settlementId: null,
      abonadoBillingMode: 'monthly',
      ended: false,
      started: false,
    })
    expect(futureMonthly.label).toBe('Por mes')
    expect(futureMonthly.tone).toBe('neutral')

    const endedMonthly = gridMoneyVisual({
      status: 'confirmed',
      type: 'fixed',
      priceSnapshot: 0,
      pending: 0,
      totalPaid: 0,
      settlementId: null,
      abonadoBillingMode: 'monthly',
      ended: true,
      started: true,
    })
    expect(endedMonthly.label).toBe('Mes sin saldar')
    expect(endedMonthly.tone).toBe('warning')

    // En gridSlotVisual nunca debe quedar como "Pagado" en verde sin settlementId
    const slotVisual = gridSlotVisual({
      status: 'completed',
      type: 'fixed',
      pending: 0,
      totalPaid: 0,
      settlementId: null,
      abonadoBillingMode: 'monthly',
      ended: true,
    })
    expect(slotVisual.label).not.toBe('Pagado')
  })

  it('no muestra un no_show cubierto por pack como Saldado (ausente manda)', () => {
    const money = gridMoneyVisual({
      status: 'no_show',
      type: 'fixed',
      priceSnapshot: 50_000_00,
      pending: 0,
      totalPaid: 0,
      settlementId: VALID_UUID_1,
      abonadoBillingMode: 'pack',
      ended: true,
      started: true,
    })
    expect(money.label).toBe('Ausente')
    expect(money.tone).toBe('neutral')
  })
})

describe('validación Zod de settlements, abonos y eventos multi-fecha', () => {
  it('permite monthly con monto $0 en already_settled y sin teléfono', () => {
    const parsedAbonado = createAbonadoSchema.safeParse({
      courtId: VALID_UUID_1,
      contactName: 'Escuelita Infantil',
      dayOfWeek: 2,
      timeStart: '17:00',
      timeEnd: '18:00',
      pricePerSession: 0,
      billingMode: 'monthly',
      agreedAmount: 0,
      startsOn: '2026-11-03',
      initialSettlement: {
        kind: 'monthly',
        paymentOrigin: 'already_settled',
        amount: 0,
        month: '2026-11',
      },
    })
    expect(parsedAbonado.success).toBe(true)
  })

  it('exige monto > 0 y métodos cuando el settlement entra por Caja', () => {
    const missingCharges = settleAbonadoPeriodSchema.safeParse({
      abonadoId: VALID_UUID_1,
      kind: 'pack',
      paymentOrigin: 'caja',
      amount: 100_000_00,
      creditsTotal: 4,
    })
    expect(missingCharges.success).toBe(false)

    const validPack = settleAbonadoPeriodSchema.safeParse({
      abonadoId: VALID_UUID_1,
      kind: 'pack',
      paymentOrigin: 'caja',
      amount: 100_000_00,
      creditsTotal: 4,
      charges: [{ amount: 100_000_00, method: 'transfer' }],
      clientIdempotencyKey: VALID_UUID_2,
    })
    expect(validPack.success).toBe(true)

    // Cobrar en Caja sin clave de idempotencia no se acepta (riesgo de doble cobro).
    const withoutKey = settleAbonadoPeriodSchema.safeParse({
      abonadoId: VALID_UUID_1,
      kind: 'pack',
      paymentOrigin: 'caja',
      amount: 100_000_00,
      creditsTotal: 4,
      charges: [{ amount: 100_000_00, method: 'transfer' }],
    })
    expect(withoutKey.success).toBe(false)
    expect(
      settleBookingsBatchSchema.safeParse({
        bookingIds: [VALID_UUID_1],
        paymentOrigin: 'caja',
        amount: 100_000_00,
        charges: [{ amount: 100_000_00, method: 'cash' }],
      }).success,
    ).toBe(false)
  })

  it('permite already_settled en lote con amount 0 y rechaza caja con amount 0', () => {
    expect(
      settleBookingsBatchSchema.safeParse({
        bookingIds: [VALID_UUID_1, VALID_UUID_2],
        paymentOrigin: 'already_settled',
        amount: 0,
      }).success,
    ).toBe(true)

    expect(
      settleBookingsBatchSchema.safeParse({
        bookingIds: [VALID_UUID_1],
        paymentOrigin: 'caja',
        amount: 0,
        charges: [{ amount: 100, method: 'cash' }],
      }).success,
    ).toBe(false)
  })

  it('valida eventos multi-fecha y cambio de acuerdo a mensual', () => {
    expect(
      createMultiDateEventSchema.safeParse({
        courtId: VALID_UUID_1,
        dates: ['2026-11-07', '2026-11-14', '2026-11-21'],
        timeStart: '20:00',
        timeEnd: '22:00',
        guestName: 'Torneo Relámpago',
        totalPriceOverride: 300_000_00,
        paymentMode: 'already_settled',
      }).success,
    ).toBe(true)

    expect(
      updateAbonadoAgreementSchema.safeParse({
        abonadoId: VALID_UUID_1,
        billingMode: 'monthly',
        pricePerSession: 0,
        agreedAmount: 250_000_00,
        contactName: 'Escuelita El Vagón',
      }).success,
    ).toBe(true)
  })
})
