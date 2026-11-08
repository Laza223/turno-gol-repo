import { describe, expect, it } from 'vitest'
import {
  CANCEL_REASONS,
  CANCEL_REASON_LABELS,
  PLAYER_CANCEL_REASONS,
} from '@/shared/cancel-reasons'

describe('cancel-reasons', () => {
  it('el jugador no puede elegir "cancha no disponible" ni "evento del complejo"', () => {
    expect(PLAYER_CANCEL_REASONS).not.toContain('court_unavailable')
    expect(PLAYER_CANCEL_REASONS).not.toContain('complex_event')
  })

  it('el encargado ve los 8 motivos (CANCEL_REASONS)', () => {
    expect(CANCEL_REASONS).toHaveLength(8)
  })

  it('todo código tiene label no vacío', () => {
    for (const code of CANCEL_REASONS) {
      expect(CANCEL_REASON_LABELS[code].trim()).not.toBe('')
    }
  })
})
