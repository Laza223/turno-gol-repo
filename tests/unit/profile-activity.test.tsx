// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ActivityStats from '@/app/(player)/configuracion/ActivityStats'
import { computeStreakWeeks, isoMondayOf } from '@/modules/players/activity.service'

afterEach(() => cleanup())

describe('ActivityStats', () => {
  it('un jugador con 10 partidos completados ve "10" junto a "Partidos jugados"', () => {
    render(<ActivityStats played={10} venues={4} streakWeeks={2} />)
    expect(screen.getByText('Partidos jugados').nextElementSibling?.textContent).toBe('10')
    expect(screen.getByText('Complejos visitados').nextElementSibling?.textContent).toBe('4')
    expect(screen.getByText('Racha').nextElementSibling?.textContent).toBe('2 semanas')
  })

  it('la racha usa la unidad correcta (singular)', () => {
    render(<ActivityStats played={10} venues={4} streakWeeks={1} />)
    expect(screen.getByText('1 semana')).toBeTruthy()
  })

  it('con partidos no hay salida a reservar: ya reservó', () => {
    render(<ActivityStats played={3} venues={1} streakWeeks={0} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('sin partidos muestra los ceros y una salida a reservar', () => {
    render(<ActivityStats played={0} venues={0} streakWeeks={0} />)
    expect(screen.getByText('Partidos jugados').nextElementSibling?.textContent).toBe('0')
    expect(screen.getByText(/tu primer partido/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reservar una cancha' }).getAttribute('href')).toBe(
      '/explorar',
    )
  })

  it('es neutro: sin puntajes ni rankings, y tiene su ancla y su encabezado', () => {
    const { container } = render(<ActivityStats played={10} venues={4} streakWeeks={2} />)
    expect(container.querySelector('section#actividad')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Tu actividad' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/puntos|ranking|nivel/i)
  })
})

describe('computeStreakWeeks', () => {
  // Lunes consecutivos para armar escenarios.
  const W0 = '2026-06-08' // semana "actual" en los tests
  const W1 = '2026-06-01'
  const W2 = '2026-05-25'
  const W3 = '2026-05-18'
  const W5 = '2026-05-04' // deja gap en W4

  it('sin partidos la racha es 0', () => {
    expect(computeStreakWeeks([], W0)).toBe(0)
  })

  it('partido solo esta semana → racha de 1', () => {
    expect(computeStreakWeeks([W0], W0)).toBe(1)
  })

  it('tres semanas consecutivas → racha de 3', () => {
    expect(computeStreakWeeks([W0, W1, W2], W0)).toBe(3)
  })

  it('un gap corta la racha (no cuenta semanas anteriores al hueco)', () => {
    expect(computeStreakWeeks([W0, W1, W3], W0)).toBe(2)
    expect(computeStreakWeeks([W2, W3, W5], W0)).toBe(0)
  })

  it('la semana en curso sin partido todavía no corta la racha (gracia)', () => {
    expect(computeStreakWeeks([W1, W2, W3], W0)).toBe(3)
  })

  it('isoMondayOf devuelve el lunes ISO de cualquier día de la semana', () => {
    expect(isoMondayOf('2026-06-08')).toBe('2026-06-08') // lunes
    expect(isoMondayOf('2026-06-11')).toBe('2026-06-08') // jueves
    expect(isoMondayOf('2026-06-14')).toBe('2026-06-08') // domingo
  })
})
