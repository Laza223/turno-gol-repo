import { describe, expect, it } from 'vitest'
import { getRefundOutcome } from '@/modules/bookings/refund-outcome'

/**
 * Único cálculo de "qué pasa con la seña" para los dos diálogos admin de
 * cancelar (`BookingActions.tsx`, `SlotCancelDialog.tsx`). Reusa
 * `decideAdminRefund` — este test cubre la tabla completa, no reimplementa
 * la fórmula: cada caso se verifica contra el comportamiento documentado de
 * `decideAdminRefund` (booking.cancellation.ts).
 */
describe('getRefundOutcome', () => {
  const HOUR = 3_600_000
  const start = Date.UTC(2026, 6, 20, 20, 0, 0) // 20:00 UTC
  const end = start + HOUR // turno de 1h

  const base = {
    bookingStartUtcMs: start,
    bookingEndUtcMs: end,
    policyHours: 12,
  }

  it('sin seña pagada (not_required) → no_deposit, sin importar lo demás', () => {
    const outcome = getRefundOutcome({
      ...base,
      depositStatus: 'not_required',
      depositAmountCents: 0,
      paymentMethod: null,
      nowMs: start - 100 * HOUR,
      cancellationType: null,
    })
    expect(outcome).toEqual({ kind: 'no_deposit' })
  })

  it('depositAmount 0 aunque diga paid → no_deposit (defensivo)', () => {
    const outcome = getRefundOutcome({
      ...base,
      depositStatus: 'paid',
      depositAmountCents: 0,
      paymentMethod: 'mercadopago',
      nowMs: start - 100 * HOUR,
      cancellationType: null,
    })
    expect(outcome).toEqual({ kind: 'no_deposit' })
  })

  describe('turno ya terminado (B3): nunca reembolsa, ni con cancellationType complejo', () => {
    it('exactamente en el instante de fin (nowMs === bookingEndUtcMs) → turno_ended', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'mercadopago',
        nowMs: end,
        cancellationType: null,
      })
      expect(outcome).toEqual({ kind: 'turno_ended', amountCents: 450_000 })
    })

    it('con cancellationType complejo, turno terminado → sigue siendo turno_ended (nunca refund)', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'mercadopago',
        nowMs: end + HOUR,
        cancellationType: 'complejo',
      })
      expect(outcome).toEqual({ kind: 'turno_ended', amountCents: 450_000 })
    })

    it('con cancellationType jugador, turno terminado → turno_ended', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'cash',
        nowMs: end + HOUR,
        cancellationType: 'jugador',
      })
      expect(outcome).toEqual({ kind: 'turno_ended', amountCents: 450_000 })
    })
  })

  describe('sin elegir quién cancela (cancellationType null), turno no terminado', () => {
    it('dentro del plazo → undecided con los dos resultados en true', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'mercadopago',
        nowMs: start - 13 * HOUR, // dentro del plazo de 12h
        cancellationType: null,
      })
      expect(outcome).toEqual({
        kind: 'undecided',
        amountCents: 450_000,
        policyHours: 12,
        ifPlayer: { shouldRefund: true },
        ifComplex: { shouldRefund: true },
      })
    })

    it('fuera del plazo → undecided con ifPlayer false, ifComplex siempre true', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'cash',
        nowMs: start - 1 * HOUR, // fuera del plazo de 12h
        cancellationType: null,
      })
      expect(outcome).toEqual({
        kind: 'undecided',
        amountCents: 450_000,
        policyHours: 12,
        ifPlayer: { shouldRefund: false },
        ifComplex: { shouldRefund: true },
      })
    })

    it('exactamente en el límite del plazo (mismo < que decideAdminRefund) → NO está en plazo', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'cash',
        nowMs: start - base.policyHours * HOUR, // nowMs === bookingStart - policyHours*3_600_000
        cancellationType: null,
      })
      expect(outcome.kind).toBe('undecided')
      if (outcome.kind === 'undecided') {
        expect(outcome.ifPlayer.shouldRefund).toBe(false)
      }
    })
  })

  describe('cancellationType complejo, turno no terminado: reembolsa siempre', () => {
    it('dentro de plazo, canal mercadopago → refund mercadopago', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'mercadopago',
        nowMs: start - 13 * HOUR,
        cancellationType: 'complejo',
      })
      expect(outcome).toEqual({ kind: 'refund', amountCents: 450_000, channel: 'mercadopago' })
    })

    it('fuera de plazo, canal manual → refund manual (el motivo es del complejo, no del jugador)', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'cash',
        nowMs: start - 1 * HOUR,
        cancellationType: 'complejo',
      })
      expect(outcome).toEqual({ kind: 'refund', amountCents: 450_000, channel: 'manual' })
    })

    it('paymentMethod transfer → channel manual', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'transfer',
        nowMs: start - 13 * HOUR,
        cancellationType: 'complejo',
      })
      expect(outcome).toEqual({ kind: 'refund', amountCents: 450_000, channel: 'manual' })
    })
  })

  describe('cancellationType jugador, turno no terminado: aplica la política', () => {
    it('dentro de plazo, mercadopago → refund mercadopago', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'mercadopago',
        nowMs: start - 13 * HOUR,
        cancellationType: 'jugador',
      })
      expect(outcome).toEqual({ kind: 'refund', amountCents: 450_000, channel: 'mercadopago' })
    })

    it('fuera de plazo, manual → no_refund_policy', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'cash',
        nowMs: start - 1 * HOUR,
        cancellationType: 'jugador',
      })
      expect(outcome).toEqual({ kind: 'no_refund_policy', amountCents: 450_000, policyHours: 12 })
    })

    it('exactamente en el límite del plazo → no_refund_policy (mismo < estricto que decideAdminRefund)', () => {
      const outcome = getRefundOutcome({
        ...base,
        depositStatus: 'paid',
        depositAmountCents: 450_000,
        paymentMethod: 'mercadopago',
        nowMs: start - base.policyHours * HOUR,
        cancellationType: 'jugador',
      })
      expect(outcome).toEqual({ kind: 'no_refund_policy', amountCents: 450_000, policyHours: 12 })
    })
  })
})
