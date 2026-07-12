// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { StatCard } from '@/components/admin/StatCard'

afterEach(() => cleanup())

describe('StatCard', () => {
  it('renderiza label, valor y sub', () => {
    const { getByText } = render(<StatCard label="Reservas" value="128" sub="hoy" />)
    expect(getByText('Reservas')).toBeTruthy()
    expect(getByText('128')).toBeTruthy()
    expect(getByText('hoy')).toBeTruthy()
  })

  it('delta up usa color emerald y glifo ↑', () => {
    const { getByText } = render(
      <StatCard label="x" value="1" delta={{ label: '12%', direction: 'up' }} />,
    )
    const delta = getByText(/12%/)
    // emerald-700, no emerald-600: sobre una card blanca, emerald-600 (#059669) da
    // 3.76:1 y no llega al 4.5 de WCAG AA. emerald-700 (#047857) da 5.5:1.
    expect(delta.className).toContain('text-emerald-700')
    expect(delta.textContent).toContain('↑')
  })

  it('delta down usa color red y glifo ↓', () => {
    const { getByText } = render(
      <StatCard label="x" value="1" delta={{ label: '3%', direction: 'down' }} />,
    )
    const delta = getByText(/3%/)
    expect(delta.className).toContain('text-red-600')
    expect(delta.textContent).toContain('↓')
  })

  it('accent violet aplica el ring violeta al halo del icono', () => {
    const { container } = render(
      <StatCard label="x" value="1" accent="violet" icon={<svg data-testid="i" />} />,
    )
    const halo = container.querySelector('span.ring-1')
    expect(halo?.className).toContain('text-violet-600')
  })
})
