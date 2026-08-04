import { describe, it, expect } from 'vitest'
import { compareToLastWeek, sortAttentionItems, sortWhileAwayItems, ATTENTION_EMPTY_COPY } from './home.lib'
import type { AttentionItem, WhileAwayItem } from './home.types'

describe('compareToLastWeek', () => {
  it('detecta suba', () => {
    const r = compareToLastWeek(150_00, 100_00)
    expect(r.direction).toBe('up')
    expect(r.deltaCents).toBe(50_00)
    expect(r.deltaPct).toBe(50)
  })

  it('detecta baja', () => {
    const r = compareToLastWeek(80_00, 100_00)
    expect(r.direction).toBe('down')
    expect(r.deltaCents).toBe(-20_00)
    expect(r.deltaPct).toBe(-20)
  })

  it('detecta igual', () => {
    const r = compareToLastWeek(100_00, 100_00)
    expect(r.direction).toBe('flat')
    expect(r.deltaCents).toBe(0)
    expect(r.deltaPct).toBe(0)
  })

  it('sin datos la semana pasada no calcula porcentaje (evita división por cero)', () => {
    const r = compareToLastWeek(100_00, 0)
    expect(r.deltaPct).toBeNull()
    expect(r.deltaCents).toBe(100_00)
    expect(r.direction).toBe('up')
  })

  it('cero contra cero es flat sin porcentaje', () => {
    const r = compareToLastWeek(0, 0)
    expect(r.direction).toBe('flat')
    expect(r.deltaPct).toBeNull()
  })
})

describe('sortAttentionItems', () => {
  const booking: AttentionItem = {
    kind: 'unpaid_completed_booking',
    bookingId: 'b1',
    pendingCents: 1000,
    since: new Date('2026-08-02T10:00:00Z'),
    courtName: 'Cancha 1',
    timeLabel: '10:00-11:00',
    contactName: 'Juan',
  }
  const deposit: AttentionItem = {
    kind: 'failed_deposit',
    paymentId: 'p1',
    bookingId: 'b2',
    amountCents: 2000,
    since: new Date('2026-08-02T09:00:00Z'),
    courtName: 'Cancha 2',
    contactName: 'Ana',
  }
  const cashUnclosed: AttentionItem = {
    kind: 'yesterday_cash_unclosed',
    date: '2026-08-01',
    since: new Date('2026-08-01T00:00:00Z'),
  }

  it('ordena por prioridad P1 (turno sin cobrar) antes que P2 (seña fallida) antes que P3 (caja sin cerrar), sin importar el orden de entrada', () => {
    const sorted = sortAttentionItems([cashUnclosed, deposit, booking])
    expect(sorted.map((i) => i.kind)).toEqual([
      'unpaid_completed_booking',
      'failed_deposit',
      'yesterday_cash_unclosed',
    ])
  })

  it('dentro de la misma prioridad, ordena por antigüedad ascendente (más vieja primero)', () => {
    const booking2: AttentionItem = { ...booking, bookingId: 'b3', since: new Date('2026-08-02T08:00:00Z') }
    const sorted = sortAttentionItems([booking, booking2])
    expect(sorted.map((i) => (i as { bookingId: string }).bookingId)).toEqual(['b3', 'b1'])
  })

  it('lista vacía da lista vacía', () => {
    expect(sortAttentionItems([])).toEqual([])
  })
})

describe('sortWhileAwayItems', () => {
  it('ordena más reciente primero', () => {
    const older: WhileAwayItem = {
      kind: 'cancellation',
      bookingId: 'b1',
      at: new Date('2026-08-02T09:00:00Z'),
      courtName: 'Cancha 1',
      timeLabel: '09:00-10:00',
      contactName: 'Juan',
    }
    const newer: WhileAwayItem = {
      kind: 'booking_online',
      bookingId: 'b2',
      at: new Date('2026-08-02T11:00:00Z'),
      courtName: 'Cancha 2',
      timeLabel: '11:00-12:00',
      contactName: 'Ana',
    }
    expect(sortWhileAwayItems([older, newer]).map((i) => i.bookingId)).toEqual(['b2', 'b1'])
  })
})

describe('ATTENTION_EMPTY_COPY', () => {
  it('es el copy exacto del contrato', () => {
    expect(ATTENTION_EMPTY_COPY).toBe('Nada pendiente. Todo cobrado y cerrado.')
  })
})
