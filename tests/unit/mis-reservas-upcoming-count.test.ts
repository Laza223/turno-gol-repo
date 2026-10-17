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

  it('con el instante físico manda `ends_at`: el turno en juego de día operativo de ayer cuenta y el de hoy ya terminado no', () => {
    const now = Date.parse('2026-07-15T03:30:00Z') // 00:30 ART del 15
    const bookings = [
      // closes_next_day: día operativo 14, se juega el 15 de 00:00 a 01:00 ART.
      { date: '2026-07-14', status: 'confirmed', ends_at: '2026-07-15T04:00:00Z' },
      // Hoy (15) de 00:00 a 00:15 ART: ya terminó.
      { date: '2026-07-15', status: 'confirmed', ends_at: '2026-07-15T03:15:00Z' },
    ]
    expect(countUpcomingPlayable(bookings, '2026-07-15', now)).toBe(1)
  })

  it('incluye hoy mismo (>=)', () => {
    const bookings = [{ date: '2026-07-14', status: 'confirmed' }]
    expect(countUpcomingPlayable(bookings, '2026-07-14')).toBe(1)
  })
})
