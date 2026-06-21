import { describe, expect, it } from 'vitest'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'

describe('summarizeBookingCharges — Tarea #8: saldo del turno', () => {
  it('seña paga + sin cobros extra → pendiente = precio - seña', () => {
    const s = summarizeBookingCharges({
      priceSnapshot: 55_000_00,
      depositAmount: 16_500_00,
      depositStatus: 'paid',
      chargesTotal: 0,
    })
    expect(s.depositCounted).toBe(16_500_00)
    expect(s.totalPaid).toBe(16_500_00)
    expect(s.pending).toBe(38_500_00)
  })

  it('seña + cobro parcial → pendiente baja', () => {
    const s = summarizeBookingCharges({
      priceSnapshot: 55_000_00,
      depositAmount: 16_500_00,
      depositStatus: 'paid',
      chargesTotal: 20_000_00,
    })
    expect(s.totalPaid).toBe(36_500_00)
    expect(s.pending).toBe(18_500_00)
  })

  it('cobro total → pendiente = 0', () => {
    const s = summarizeBookingCharges({
      priceSnapshot: 55_000_00,
      depositAmount: 16_500_00,
      depositStatus: 'paid',
      chargesTotal: 38_500_00,
    })
    expect(s.pending).toBe(0)
  })

  it('seña reembolsada NO cuenta como pagada (no infla totalPaid)', () => {
    const s = summarizeBookingCharges({
      priceSnapshot: 55_000_00,
      depositAmount: 16_500_00,
      depositStatus: 'refunded',
      chargesTotal: 0,
    })
    expect(s.depositCounted).toBe(0)
    expect(s.pending).toBe(55_000_00)
  })

  it('seña capturada (no-show / sin reembolso) cuenta como dinero del complejo', () => {
    const s = summarizeBookingCharges({
      priceSnapshot: 55_000_00,
      depositAmount: 16_500_00,
      depositStatus: 'captured',
      chargesTotal: 0,
    })
    expect(s.depositCounted).toBe(16_500_00)
    expect(s.pending).toBe(38_500_00)
  })

  it('sin seña (abonado/efectivo) → pendiente = precio completo', () => {
    const s = summarizeBookingCharges({
      priceSnapshot: 50_000_00,
      depositAmount: 0,
      depositStatus: 'not_required',
      chargesTotal: 0,
    })
    expect(s.depositCounted).toBe(0)
    expect(s.pending).toBe(50_000_00)
  })

  it('sobrepago no produce pendiente negativo (clamp a 0)', () => {
    const s = summarizeBookingCharges({
      priceSnapshot: 50_000_00,
      depositAmount: 0,
      depositStatus: 'not_required',
      chargesTotal: 60_000_00,
    })
    expect(s.pending).toBe(0)
  })
})
