import { describe, expect, it } from 'vitest'
import {
  isLateCancel,
  lateCancelPenalty,
  lateCancelPlayerText,
} from '@/modules/bookings/late-cancel'
import { getCancellationPreview } from '@/modules/bookings/cancellation-preview'
import { refundOutcomeText } from '@/components/booking/slot-panel/refund-outcome-text'
import { getRefundOutcome } from '@/modules/bookings/refund-outcome'

const HOUR = 3_600_000

describe('isLateCancel', () => {
  const startsAtMs = Date.UTC(2030, 0, 10, 20, 0)

  it('0 horas apaga la penalidad aunque falten minutos', () => {
    expect(isLateCancel({ startsAtMs, nowMs: startsAtMs - 1, hours: 0 })).toBe(false)
  })

  it('justo en el umbral ya es tarde; un ms antes no', () => {
    expect(isLateCancel({ startsAtMs, nowMs: startsAtMs - 4 * HOUR, hours: 4 })).toBe(true)
    expect(isLateCancel({ startsAtMs, nowMs: startsAtMs - 4 * HOUR - 1, hours: 4 })).toBe(false)
  })
})

describe('lateCancelPenalty (escalera)', () => {
  it('1ra aviso, 2da 7 días, 3ra y siguientes 30', () => {
    expect(lateCancelPenalty(1)).toEqual({ kind: 'warning' })
    expect(lateCancelPenalty(2)).toEqual({ kind: 'ban', days: 7 })
    expect(lateCancelPenalty(3)).toEqual({ kind: 'ban', days: 30 })
    expect(lateCancelPenalty(4)).toEqual({ kind: 'ban', days: 30 })
  })
})

describe('textos', () => {
  it('jugador: aviso vs bloqueo', () => {
    expect(lateCancelPlayerText({ kind: 'warning' }, 4, 'El Vagón')).toContain('solo un aviso')
    expect(lateCancelPlayerText({ kind: 'ban', days: 7 }, 4, 'El Vagón')).toContain('7 días')
  })

  it('encargado: condicional o directo', () => {
    expect(refundOutcomeText({ kind: 'no_deposit', lateCancel: 'if_player' })).toContain(
      'Si lo pide el jugador, cuenta como cancelación tardía',
    )
    expect(refundOutcomeText({ kind: 'no_deposit', lateCancel: 'yes' })).toContain(
      'Cuenta como cancelación tardía',
    )
    expect(refundOutcomeText({ kind: 'no_deposit' })).not.toContain('tardía')
  })
})

describe('getCancellationPreview sin seña', () => {
  const base = {
    depositStatus: 'not_required',
    depositAmountCents: 0,
    bookingStartUtcMs: 1_000 + 2 * HOUR,
    policyHours: 24,
    nowMs: 1_000,
  }

  it('sin setting devuelve no_deposit pelado', () => {
    expect(getCancellationPreview(base)).toEqual({ kind: 'no_deposit' })
  })

  it('con el setting y poca anticipación suma la consecuencia según el conteo', () => {
    expect(getCancellationPreview({ ...base, lateCancelHours: 4, lateCancelCount: 0 })).toEqual({
      kind: 'no_deposit',
      lateCancel: { kind: 'warning' },
    })
    expect(getCancellationPreview({ ...base, lateCancelHours: 4, lateCancelCount: 1 })).toEqual({
      kind: 'no_deposit',
      lateCancel: { kind: 'ban', days: 7 },
    })
  })

  it('con anticipación suficiente no marca nada', () => {
    expect(getCancellationPreview({ ...base, lateCancelHours: 1, lateCancelCount: 5 })).toEqual({
      kind: 'no_deposit',
    })
  })
})

describe('getRefundOutcome sin seña', () => {
  const base = {
    depositStatus: 'not_required',
    depositAmountCents: 0,
    paymentMethod: null,
    policyHours: 24,
    lateCancelHours: 4,
    hasPlayer: true,
    nowMs: 1_000,
    bookingStartUtcMs: 1_000 + 2 * HOUR,
    bookingEndUtcMs: 1_000 + 3 * HOUR,
  }

  it('"jugador" cuenta; sin decidir quién pide es condicional', () => {
    expect(getRefundOutcome({ ...base, cancellationType: 'jugador' })).toEqual({
      kind: 'no_deposit',
      lateCancel: 'yes',
    })
    expect(getRefundOutcome({ ...base, cancellationType: null })).toEqual({
      kind: 'no_deposit',
      lateCancel: 'if_player',
    })
  })

  it('"complejo" y reserva sin jugador nunca cuentan', () => {
    expect(getRefundOutcome({ ...base, cancellationType: 'complejo' })).toEqual({
      kind: 'no_deposit',
    })
    expect(getRefundOutcome({ ...base, cancellationType: 'jugador', hasPlayer: false })).toEqual({
      kind: 'no_deposit',
    })
  })
})
