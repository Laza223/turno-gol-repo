import { describe, expect, it } from 'vitest'
import {
  LANDING_STATUS_LABEL,
  RIVAL_LANDING_STATUS,
  type LandingPiece,
} from '@/modules/rival/rival-landing-status'

// Lo único que existe hoy es v1 (spec 2026-10-22). Si sale una ola, se cambia una línea del mapa
// Y esta lista: la landing no puede decir "Ya disponible" de algo que no está en la cancha.
const V1_PIECES: LandingPiece[] = [
  'groupMatch',
  'voy',
  'bench',
  'cupo',
  'fijo',
  'reservedSeal',
  'level',
  'board',
  'mailAlerts',
]

describe('mapa de estados de la landing de RIVAL', () => {
  const entries = Object.entries(RIVAL_LANDING_STATUS) as [LandingPiece, 'available' | 'soon'][]

  it('solo las piezas de v1 están "available"', () => {
    const available = entries.filter(([, status]) => status === 'available').map(([piece]) => piece)
    expect(available.sort()).toEqual([...V1_PIECES].sort())
  })

  it('todo lo demás (club, categoría, partido oficial, tapa, estadio…) es "soon"', () => {
    for (const piece of [
      'category',
      'club',
      'officialMatch',
      'figure',
      'stadium',
      'seasonZero',
    ] as const) {
      expect(RIVAL_LANDING_STATUS[piece]).toBe('soon')
    }
  })

  it('cada estado tiene su rótulo para el chip', () => {
    expect(LANDING_STATUS_LABEL).toEqual({ available: 'Ya disponible', soon: 'Próximamente' })
  })
})
