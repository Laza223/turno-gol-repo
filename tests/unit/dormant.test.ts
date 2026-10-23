import { describe, expect, it } from 'vitest'
import {
  DORMANT_AFTER_DAYS,
  DORMANT_MIN_BOOKINGS,
  lastSeenLabel,
  winBackMessage,
} from '@/modules/relationships/dormant'

// Clientes que dejaron de venir: docs/decisions/2026-10-22-clientes-que-dejaron-de-venir.md.

const DAY_MS = 86_400_000
const NOW_MS = Date.parse('2026-10-22T15:00:00Z')
const ago = (days: number, extraMs = 0) => new Date(NOW_MS - days * DAY_MS - extraMs).toISOString()

describe('umbrales decididos por el dueño', () => {
  it('4 semanas y 3 reservas, fijos', () => {
    // Cambiarlos es una decisión de producto, no un ajuste: el test lo frena.
    expect(DORMANT_AFTER_DAYS).toBe(28)
    expect(DORMANT_MIN_BOOKINGS).toBe(3)
  })
})

describe('lastSeenLabel', () => {
  it.each([
    [0, 'esta semana'],
    [6, 'esta semana'],
    [7, 'hace 1 semana'],
    [13, 'hace 1 semana'],
    [14, 'hace 2 semanas'],
    [29, 'hace 4 semanas'],
    [35, 'hace 5 semanas'],
    [62, 'hace 8 semanas'],
    // A partir de 9 semanas se pasa a meses: "hace 23 semanas" no se lee.
    [63, 'hace 2 meses'],
    [174, 'hace 5 meses'],
    [364, 'hace 12 meses'],
    [365, 'hace más de un año'],
    [900, 'hace más de un año'],
  ])('%i días → %s', (days, label) => {
    expect(lastSeenLabel(ago(days), NOW_MS)).toBe(label)
  })

  it('cuenta días completos: 34 días y 23 h siguen siendo 4 semanas', () => {
    expect(lastSeenLabel(ago(34, 23 * 3_600_000), NOW_MS)).toBe('hace 4 semanas')
  })

  it('una fecha futura (reloj corrido) no da negativo', () => {
    expect(lastSeenLabel(new Date(NOW_MS + DAY_MS).toISOString(), NOW_MS)).toBe('esta semana')
  })
})

describe('winBackMessage', () => {
  const base = {
    name: 'Diego Sosa',
    tenantName: 'El Vagón',
    publicUrl: 'https://turnogol.com.ar/el-vagon',
  }

  it('el mensaje aprobado, con el primer nombre y el link a la ficha', () => {
    expect(winBackMessage(base)).toBe(
      'Hola Diego! ¿Cómo andás? Te escribimos de El Vagón. Hace un tiempo que no te vemos por acá. Si querés volver, reservá acá: https://turnogol.com.ar/el-vagon',
    )
  })

  it('sin URL absoluta no va la invitación a reservar', () => {
    expect(winBackMessage({ ...base, publicUrl: null })).toBe(
      'Hola Diego! ¿Cómo andás? Te escribimos de El Vagón. Hace un tiempo que no te vemos por acá.',
    )
  })

  it('el primer nombre ignora espacios de más', () => {
    expect(winBackMessage({ ...base, name: '  Juan   Ignacio Pérez ' })).toMatch(/^Hola Juan! /)
  })

  it('sin nombre saluda igual, sin dejar "Hola !"', () => {
    expect(winBackMessage({ ...base, name: '   ' })).toMatch(/^Hola! ¿Cómo andás\?/)
  })
})
