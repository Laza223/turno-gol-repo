import { describe, expect, it } from 'vitest'
import { countUpcomingPlayable } from '@/app/(player)/mis-reservas/upcoming-count'

/**
 * ENS-1: "Tenés N turnos por jugar" filtraba solo por fecha (>= hoy) y
 * contaba reservas canceladas/expiradas/jugadas como si fueran turnos
 * pendientes. Solo cuentan las que TODAVÍA van a jugarse.
 */
describe('countUpcomingPlayable (ENS-1)', () => {
  it('cuenta confirmed y pending_payment futuras', () => {
    const bookings = [
      { date: '2026-08-01', status: 'confirmed' },
      { date: '2026-08-02', status: 'pending_payment' },
    ]
    expect(countUpcomingPlayable(bookings, '2026-07-14')).toBe(2)
  })

  it('excluye canceled_refunded/canceled_no_refund/expired/completed/no_show aunque sean futuras', () => {
    const bookings = [
      { date: '2026-08-01', status: 'canceled_refunded' },
      { date: '2026-08-01', status: 'canceled_no_refund' },
      { date: '2026-08-01', status: 'expired' },
      { date: '2026-08-01', status: 'completed' },
      { date: '2026-08-01', status: 'no_show' },
    ]
    expect(countUpcomingPlayable(bookings, '2026-07-14')).toBe(0)
  })

  it('excluye reservas pasadas aunque estén confirmed', () => {
    const bookings = [{ date: '2026-07-01', status: 'confirmed' }]
    expect(countUpcomingPlayable(bookings, '2026-07-14')).toBe(0)
  })

  it('incluye hoy mismo (>=)', () => {
    const bookings = [{ date: '2026-07-14', status: 'confirmed' }]
    expect(countUpcomingPlayable(bookings, '2026-07-14')).toBe(1)
  })
})
