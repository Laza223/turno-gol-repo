import { describe, expect, it } from 'vitest'
import { decideAdminRefund } from '@/modules/bookings/booking.cancellation'

const HOUR = 3_600_000
// Reserva de referencia: arranca dentro de 48h.
const START = 1_000_000_000_000
const now = (hoursBeforeStart: number) => START - hoursBeforeStart * HOUR

describe('decideAdminRefund — Tarea #3: motivo decide el reembolso', () => {
  it('complejo cancela DENTRO de la ventana → reembolso forzado', () => {
    const r = decideAdminRefund({
      cancellationType: 'complejo',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: now(48),
    })
    expect(r.shouldRefund).toBe(true)
  })

  it('complejo cancela FUERA de la ventana → reembolso igual forzado (no es culpa del jugador)', () => {
    const r = decideAdminRefund({
      cancellationType: 'complejo',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: now(2), // ya pasó el plazo de 24h
    })
    expect(r.shouldRefund).toBe(true)
    expect(r.inPolicy).toBe(false)
  })

  it('jugador pide cancelar DENTRO de la ventana → reembolso por política', () => {
    const r = decideAdminRefund({
      cancellationType: 'jugador',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: now(48),
    })
    expect(r.shouldRefund).toBe(true)
    expect(r.inPolicy).toBe(true)
  })

  it('jugador pide cancelar FUERA de la ventana → sin reembolso (retención)', () => {
    const r = decideAdminRefund({
      cancellationType: 'jugador',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: now(2),
    })
    expect(r.shouldRefund).toBe(false)
    expect(r.inPolicy).toBe(false)
  })

  it('límite exacto del plazo cuenta como fuera de política (no estricto)', () => {
    const r = decideAdminRefund({
      cancellationType: 'jugador',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: START - 24 * HOUR, // justo en el borde
    })
    expect(r.inPolicy).toBe(false)
    expect(r.shouldRefund).toBe(false)
  })
})

describe('decideAdminRefund — guard: turno YA TERMINADO nunca reembolsa', () => {
  it('complejo + turno YA TERMINADO → shouldRefund=false (bug B3: hoy reembolsa incondicional)', () => {
    const r = decideAdminRefund({
      cancellationType: 'complejo',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: START + 2 * HOUR, // el turno ya terminó hace 1h
    })
    expect(r.shouldRefund).toBe(false)
  })

  it('complejo + turno futuro (aún no termina) → reembolso forzado (no-regresión)', () => {
    const r = decideAdminRefund({
      cancellationType: 'complejo',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: now(48),
    })
    expect(r.shouldRefund).toBe(true)
  })

  it('jugador + turno YA TERMINADO → shouldRefund=false', () => {
    const r = decideAdminRefund({
      cancellationType: 'jugador',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: START + 2 * HOUR,
    })
    expect(r.shouldRefund).toBe(false)
  })

  it('borde: nowMs === bookingEndUtcMs cuenta como terminado (>=) → shouldRefund=false', () => {
    const r = decideAdminRefund({
      cancellationType: 'complejo',
      bookingStartUtcMs: START,
      bookingEndUtcMs: START + HOUR,
      policyHours: 24,
      nowMs: START + HOUR, // justo el instante en que termina
    })
    expect(r.shouldRefund).toBe(false)
  })
})
