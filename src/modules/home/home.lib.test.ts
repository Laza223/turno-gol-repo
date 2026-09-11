import { describe, it, expect } from 'vitest'
import { sortAttentionItems, sortWhileAwayItems, ATTENTION_EMPTY_COPY } from './home.lib'
import type { AttentionItem, WhileAwayItem } from './home.types'

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
  const refund: AttentionItem = {
    kind: 'pending_refunds',
    count: 2,
    totalCents: 300000,
    since: new Date('2026-08-01T00:00:00Z'),
  }

  it('ordena por prioridad P1 (turno sin cobrar) antes que P2 (devolución pendiente) antes que P3 (seña fallida), sin importar el orden de entrada', () => {
    const sorted = sortAttentionItems([deposit, refund, booking])
    expect(sorted.map((i) => i.kind)).toEqual([
      'unpaid_completed_booking',
      'pending_refunds',
      'failed_deposit',
    ])
  })

  it('dentro de la misma prioridad, ordena por antigüedad ascendente (más vieja primero)', () => {
    const booking2: AttentionItem = {
      ...booking,
      bookingId: 'b3',
      since: new Date('2026-08-02T08:00:00Z'),
    }
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
