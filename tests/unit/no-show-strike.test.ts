import { describe, expect, it } from 'vitest'
import { nextNoShowCount } from '@/modules/relationships/ptr.service'
import { NO_SHOW_STRIKE_WINDOW_DAYS } from '@/shared/constants'

const DAY_MS = 24 * 60 * 60 * 1000

// Softban por ausencias reiteradas (reemplaza la deuda del cambio #5): 1ra
// ausencia (o 1ra después de la ventana) solo se registra, 2da dentro de la
// ventana es reincidencia.
describe('nextNoShowCount', () => {
  it('nunca faltó antes → 1er strike', () => {
    expect(nextNoShowCount(null, 0, new Date('2026-07-11'))).toBe(1)
  })

  it('faltó ayer (dentro de la ventana) → suma reincidencia', () => {
    const lastNoShowAt = new Date('2026-07-10')
    const now = new Date('2026-07-11')
    expect(nextNoShowCount(lastNoShowAt, 1, now)).toBe(2)
  })

  it('3ra falta seguida dentro de ventana → sigue sumando', () => {
    const lastNoShowAt = new Date('2026-07-11')
    const now = new Date('2026-07-12')
    expect(nextNoShowCount(lastNoShowAt, 2, now)).toBe(3)
  })

  it(`exactamente en el borde de ${NO_SHOW_STRIKE_WINDOW_DAYS} días → todavía cuenta como reincidencia`, () => {
    const lastNoShowAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date(lastNoShowAt.getTime() + NO_SHOW_STRIKE_WINDOW_DAYS * DAY_MS)
    expect(nextNoShowCount(lastNoShowAt, 1, now)).toBe(2)
  })

  it(`más de ${NO_SHOW_STRIKE_WINDOW_DAYS} días sin faltar → resetea a 1`, () => {
    const lastNoShowAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date(lastNoShowAt.getTime() + (NO_SHOW_STRIKE_WINDOW_DAYS + 1) * DAY_MS)
    expect(nextNoShowCount(lastNoShowAt, 1, now)).toBe(1)
  })
})
