// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ConfiguracionView } from '@/app/(player)/configuracion/ConfiguracionView'

afterEach(cleanup)

function renderView(overrides: Partial<Parameters<typeof ConfiguracionView>[0]> = {}) {
  return render(
    <ConfiguracionView
      profile={{ firstName: 'Tomás', lastName: 'Ibáñez', phone: '', preferredArea: '' }}
      email="tomas@example.com"
      favorites={[{ id: 't1', slug: 'el-potrero', name: 'El Potrero', city: 'Rosario' }]}
      activity={{ played: 3, venues: 1, streakWeeks: 1 }}
      updateProfileAction={vi.fn(async () => ({ success: true as const }))}
      signOutAction={vi.fn(async () => {})}
      {...overrides}
    />,
  )
}

describe('ConfiguracionView — Mi cuenta en una sola página', () => {
  it('un solo h1 "Mi cuenta" y cada bloque con su h2, en el orden de uso', () => {
    renderView()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'Mi cuenta',
    ])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Quién sos',
      'Tus datos',
      'Favoritos',
      'Tu actividad',
      'Tema y sesión',
      'Tus datos personales',
      'Darte de baja',
    ])
  })

  it('los ids a los que redirige /perfil existen (datos, favoritos, actividad)', () => {
    const { container } = renderView()
    for (const id of ['tus-datos', 'favoritos', 'actividad']) {
      expect(container.querySelector(`section#${id}`), id).not.toBeNull()
    }
  })

  it('no hay interruptores de avisos, y una línea dice qué mails llegan siempre', () => {
    const { container } = renderView()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/push|novedades por email/i)
    const linea = screen.getByText(/Te mandamos siempre un mail/)
    expect(linea.textContent).toContain('confirma')
    expect(linea.textContent).toContain('cancela')
    expect(linea.textContent).toContain('cambia el horario')
    expect(linea.textContent).toContain('se vence la seña')
    // Va dentro de "Tus datos".
    expect(linea.closest('section')?.id).toBe('tus-datos')
  })

  it('el email se muestra y no se edita', () => {
    renderView()
    expect(screen.getByText('tomas@example.com')).toBeTruthy()
    expect(screen.queryByDisplayValue('tomas@example.com')).toBeNull()
  })

  it('tema y salir están en la página; Salir es un submit del form de signOut', () => {
    renderView()
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeTruthy()
    const salir = screen.getByRole('button', { name: 'Salir' })
    expect(salir.getAttribute('type')).toBe('submit')
    expect(salir.closest('form')).not.toBeNull()
  })

  it('descargar tus datos va en palabras de jugador, y la ley en una línea chica al final', () => {
    renderView()
    const seccion = screen
      .getByRole('heading', { name: 'Tus datos personales' })
      .closest('section')!
    expect(within(seccion).getByRole('button', { name: 'Descargar mis datos' })).toBeTruthy()
    expect(seccion.textContent).not.toMatch(/ARCO/)
    const ley = within(seccion).getByText(/Ley 25\.326/)
    expect(ley.className).toContain('text-sm')
    expect(seccion.lastElementChild).toBe(ley)
  })

  it('eliminar la cuenta es un link sobrio, sin tarjeta roja', () => {
    const { container } = renderView()
    const link = screen.getByRole('link', { name: 'Eliminar la cuenta' })
    expect(link.getAttribute('href')).toBe('/eliminar-cuenta')
    expect(container.innerHTML).not.toMatch(/bg-red-|border-red-/)
  })

  it('sin favoritos ni partidos hay salida a Explorar y a reservar', () => {
    renderView({ favorites: [], activity: { played: 0, venues: 0, streakWeeks: 0 } })
    expect(screen.getByRole('link', { name: 'Explorar complejos' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reservar una cancha' })).toBeTruthy()
  })

  it('no trae la banda hero de La Previa ni itálica negra', () => {
    const { container } = renderView()
    expect(container.querySelector('.player-hero-band')).toBeNull()
    expect(container.innerHTML).not.toMatch(/\bitalic\b|font-black/)
  })
})
