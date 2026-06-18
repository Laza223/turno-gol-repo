import { describe, expect, it } from 'vitest'
import {
  TRANSITIONS,
  assertTransition,
  canTransition,
} from '@/modules/bookings/booking.state-machine'
import { InvalidTransitionError } from '@/modules/bookings/booking.errors'
import type {
  BookingStatus,
  CancellationActor,
} from '@/modules/bookings/booking.types'

const ALL_STATUSES: BookingStatus[] = [
  'pending_payment',
  'confirmed',
  'expired',
  'canceled_refunded',
  'canceled_no_refund',
  'completed',
  'no_show',
]

const ALL_ACTORS: CancellationActor[] = ['player', 'admin', 'system']

const VALID_PAIRS: Array<[BookingStatus, BookingStatus]> = [
  ['pending_payment', 'confirmed'],
  ['pending_payment', 'expired'],
  ['confirmed', 'canceled_refunded'],
  ['confirmed', 'canceled_no_refund'],
  ['confirmed', 'completed'],
  ['confirmed', 'no_show'],
]

const validSet = new Set(VALID_PAIRS.map(([a, b]) => `${a}->${b}`))

describe('TRANSITIONS matrix (doc6 §3 — full coverage)', () => {
  it('contains exactly 6 valid (from, to) pairs', () => {
    let total = 0
    for (const from of ALL_STATUSES) {
      total += TRANSITIONS[from].size
    }
    expect(total).toBe(6)
  })

  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const key = `${from}->${to}`
      const isValid = validSet.has(key)
      it(`${key} → canTransition (no ctx) === ${isValid}`, () => {
        expect(canTransition(from, to)).toBe(isValid)
      })
    }
  }

  it('all 7 self-loops are invalid', () => {
    for (const s of ALL_STATUSES) {
      expect(canTransition(s, s)).toBe(false)
    }
  })

  it('terminal states have empty outgoing set', () => {
    for (const s of ['expired', 'canceled_refunded', 'canceled_no_refund', 'completed', 'no_show'] as const) {
      expect(TRANSITIONS[s].size).toBe(0)
    }
  })
})

describe('actor authorization', () => {
  it('confirmed → completed: system OK, admin OK, player BLOCKED', () => {
    expect(canTransition('confirmed', 'completed', { actor: 'system' })).toBe(true)
    expect(canTransition('confirmed', 'completed', { actor: 'admin' })).toBe(true)
    expect(canTransition('confirmed', 'completed', { actor: 'player' })).toBe(false)
  })

  it('confirmed → no_show: admin OK, system BLOCKED, player BLOCKED', () => {
    expect(canTransition('confirmed', 'no_show', { actor: 'admin' })).toBe(true)
    expect(canTransition('confirmed', 'no_show', { actor: 'system' })).toBe(false)
    expect(canTransition('confirmed', 'no_show', { actor: 'player' })).toBe(false)
  })

  it('pending_payment → expired: system OK, admin BLOCKED, player BLOCKED', () => {
    expect(canTransition('pending_payment', 'expired', { actor: 'system' })).toBe(true)
    expect(canTransition('pending_payment', 'expired', { actor: 'admin' })).toBe(false)
    expect(canTransition('pending_payment', 'expired', { actor: 'player' })).toBe(false)
  })

  it('pending_payment → confirmed: system/admin OK, player BLOCKED', () => {
    expect(canTransition('pending_payment', 'confirmed', { actor: 'system' })).toBe(true)
    expect(canTransition('pending_payment', 'confirmed', { actor: 'admin' })).toBe(true)
    expect(canTransition('pending_payment', 'confirmed', { actor: 'player' })).toBe(false)
  })

  it('confirmed → canceled_no_refund: player/admin OK, system BLOCKED', () => {
    expect(canTransition('confirmed', 'canceled_no_refund', { actor: 'player' })).toBe(true)
    expect(canTransition('confirmed', 'canceled_no_refund', { actor: 'admin' })).toBe(true)
    expect(canTransition('confirmed', 'canceled_no_refund', { actor: 'system' })).toBe(false)
  })

  it('confirmed → canceled_refunded: any actor OK', () => {
    expect(canTransition('confirmed', 'canceled_refunded', { actor: 'player' })).toBe(true)
    expect(canTransition('confirmed', 'canceled_refunded', { actor: 'admin' })).toBe(true)
    expect(canTransition('confirmed', 'canceled_refunded', { actor: 'system' })).toBe(true)
  })
})

describe('assertTransition', () => {
  it('returns void on valid transition', () => {
    expect(assertTransition('confirmed', 'completed', { actor: 'system' })).toBeUndefined()
  })

  it('no lanza en transición válida sin ctx', () => {
    expect(() => assertTransition('pending_payment', 'confirmed')).not.toThrow()
  })

  it('throws InvalidTransitionError on invalid transition', () => {
    expect(() => assertTransition('expired', 'confirmed')).toThrow(InvalidTransitionError)
  })

  // Gap: el branch `reason ? (reason)` en InvalidTransitionError sólo agrega
  // `(actor=...)` cuando hay ctx. Sin ctx el mensaje NO debe filtrar actor.
  it('sin ctx: el mensaje de error no incluye actor=', () => {
    try {
      assertTransition('expired', 'confirmed')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError)
      const msg = (e as Error).message
      expect(msg).toContain('expired -> confirmed')
      expect(msg).not.toContain('actor=')
    }
  })

  it('error message includes from/to/actor', () => {
    try {
      assertTransition('confirmed', 'no_show', { actor: 'player' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError)
      const msg = (e as Error).message
      expect(msg).toContain('confirmed')
      expect(msg).toContain('no_show')
      expect(msg).toContain('player')
    }
  })

  it('throws on self-loop', () => {
    expect(() => assertTransition('confirmed', 'confirmed')).toThrow(InvalidTransitionError)
  })
})

// Invariantes que protegen contra refactors del orden matriz/actor en
// canTransition. La matriz (sin ctx) ya está pinneada arriba; estas pruebas
// pinnean la RELACIÓN entre la matriz y ACTOR_RULES sin acoplarse a la
// estructura interna (sólo usan la API pública canTransition/assertTransition).
describe('invariantes matriz ↔ actor', () => {
  it('el actor nunca amplía la matriz: si pasa con ctx, también pasa sin ctx', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const actor of ALL_ACTORS) {
          if (canTransition(from, to, { actor })) {
            // Una regla de actor sólo puede RESTRINGIR una transición válida,
            // jamás habilitar una que la matriz prohíbe.
            expect(canTransition(from, to)).toBe(true)
          }
        }
      }
    }
  })

  it('toda transición válida es alcanzable por al menos un actor', () => {
    // Si una regla de actor quedara vacía, la transición sería inalcanzable en
    // prod (todos los callers reales pasan ctx) mientras la matriz sin ctx
    // seguiría verde. Esto lo detecta.
    for (const [from, to] of VALID_PAIRS) {
      const reachable = ALL_ACTORS.some((actor) =>
        canTransition(from, to, { actor }),
      )
      expect(reachable).toBe(true)
    }
  })

  it('transición inválida en la matriz permanece bloqueada con cualquier actor', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (validSet.has(`${from}->${to}`)) continue
        for (const actor of ALL_ACTORS) {
          expect(canTransition(from, to, { actor })).toBe(false)
        }
      }
    }
  })
})

describe('completed → no_show (corrección 24h delegada a la DB)', () => {
  // booking.state-machine.ts L19-20: doc6 §3 admite completed -> no_show como
  // corrección de 24h, pero la state machine la BLOQUEA (completed es terminal);
  // la excepción la maneja el trigger enforce_booking_invariants_fn en la DB.
  // Si alguien "arregla" esto agregando no_show al set de completed, rompe la
  // garantía de inmutabilidad terminal de la capa app.
  it('está bloqueada en la capa de aplicación para todo actor', () => {
    expect(canTransition('completed', 'no_show')).toBe(false)
    for (const actor of ALL_ACTORS) {
      expect(canTransition('completed', 'no_show', { actor })).toBe(false)
    }
    expect(() =>
      assertTransition('completed', 'no_show', { actor: 'admin' }),
    ).toThrow(InvalidTransitionError)
  })
})
