import { describe, expect, it } from 'vitest'
import { whenLabel } from './today-board'

describe('whenLabel', () => {
  const nowMs = new Date('2026-09-24T15:00:00.000Z').getTime()

  it('returns null without instantes físicos (fallback de la Grilla)', () => {
    expect(whenLabel({}, false, nowMs)).toBeNull()
  })

  it('marca "Terminó hace N min" cuando el turno ya terminó', () => {
    const endsAtMs = nowMs - 4 * 60_000
    expect(whenLabel({ startsAtMs: endsAtMs - 3_600_000, endsAtMs }, true, nowMs)).toBe(
      'Terminó hace 4 min',
    )
  })

  it('dice "En juego" cuando está en curso', () => {
    expect(
      whenLabel({ startsAtMs: nowMs - 10 * 60_000, endsAtMs: nowMs + 50 * 60_000 }, false, nowMs),
    ).toBe('En juego')
  })

  it('dice "en N min" cuando arranca dentro de la hora', () => {
    expect(
      whenLabel({ startsAtMs: nowMs + 25 * 60_000, endsAtMs: nowMs + 85 * 60_000 }, false, nowMs),
    ).toBe('en 25 min')
  })

  it('devuelve null si falta más de una hora para arrancar', () => {
    expect(
      whenLabel({ startsAtMs: nowMs + 90 * 60_000, endsAtMs: nowMs + 150 * 60_000 }, false, nowMs),
    ).toBeNull()
  })
})
