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
      'Tu actividad',
      'Tus datos',
      'Favoritos',
      'Tema',
      'Tus datos personales',
      'Salir o darte de baja',
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
    expect(ley.className).toContain('rv-small')
    expect(seccion.lastElementChild).toBe(ley)
  })

  it('eliminar la cuenta es un link sobrio (no un botón sólido rojo) junto a Salir, en la misma sección', () => {
    const { container } = renderView()
    const link = screen.getByRole('link', { name: 'Eliminar la cuenta' })
    expect(link.getAttribute('href')).toBe('/eliminar-cuenta')
    expect(link.className).not.toMatch(/pill-danger|bg-red-|from-\(--portal-bad/)
    expect(container.innerHTML).not.toMatch(/bg-red-|border-red-/)
    const seccion = screen
      .getByRole('heading', { name: 'Salir o darte de baja' })
      .closest('section')!
    expect(within(seccion).getByRole('button', { name: 'Salir' })).toBeTruthy()
    expect(within(seccion).getByText(/podés borrar tu cuenta/)).toBeTruthy()
    expect(seccion.contains(link)).toBe(true)
  })

  it('sin favoritos ni partidos hay salida a Explorar y a reservar', () => {
    renderView({ favorites: [], activity: { played: 0, venues: 0, streakWeeks: 0 } })
    expect(screen.getByRole('link', { name: 'Explorar complejos' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reservar una cancha' })).toBeTruthy()
  })

  it('sin el prop rivalPhoto no hay tarjeta de RIVAL', () => {
    renderView()
    expect(screen.queryByRole('heading', { name: 'Tu perfil en RIVAL' })).toBeNull()
  })

  it('con rivalPhoto aparece la tarjeta con el campo de foto y la leyenda de quién la ve', () => {
    renderView({
      rivalPhoto: {
        url: null,
        uploadAction: vi.fn(async () => ({ success: true as const, url: null })),
        removeAction: vi.fn(async () => ({ success: true as const, url: null })),
      },
    })
    const seccion = screen.getByRole('heading', { name: 'Tu perfil en RIVAL' }).closest('section')!
    expect(within(seccion).getByRole('button', { name: 'Subir foto' })).toBeTruthy()
    expect(seccion.textContent).toMatch(/link de un partido tuyo/)
    expect(seccion.textContent).toMatch(/quitarla cuando quieras/)
  })

  it('trae "Quién sos" en vidrio con el avatar de iniciales y cada sección en un panel de vidrio', () => {
    const { container } = renderView()
    const quien = screen.getByRole('heading', { name: 'Quién sos' }).closest('section')!
    expect(quien.className).toContain('pa-me')
    expect(quien.className).toContain('glass-painted')
    expect(quien.querySelector('.pa-avatar')?.textContent).toBe('TI')
    // Datos, favoritos, tema, datos personales y baja: 5 paneles (sin RIVAL).
    expect(container.querySelectorAll('section.rv-panel.glass-painted')).toHaveLength(5)
    expect(container.querySelectorAll('.pa-stat.glass-painted')).toHaveLength(3)
    expect(container.querySelector('.player-hero-band')).toBeNull()
  })

  it('con RIVAL el panel de la foto va entre Tus datos y Favoritos', () => {
    renderView({
      rivalPhoto: {
        url: null,
        uploadAction: vi.fn(async () => ({ success: true as const, url: null })),
        removeAction: vi.fn(async () => ({ success: true as const, url: null })),
      },
    })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Quién sos',
      'Tu actividad',
      'Tus datos',
      'Tu perfil en RIVAL',
      'Favoritos',
      'Tema',
      'Tus datos personales',
      'Salir o darte de baja',
    ])
  })
})
