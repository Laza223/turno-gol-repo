// @vitest-environment happy-dom
//
// La page de /ingresar con React real. El panel de "enviado", el reenvío y el corte de red
// viven en ingresar-resend.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ userAgent: '' }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
// La foto del hero (next/image con import estático) no se resuelve en happy-dom.
vi.mock('@/components/world/HeroBackdrop', () => ({
  HeroBackdrop: () => <div data-hero-backdrop />,
}))
// El cromo del portal (cabecera, barra de abajo, sesión) tiene sus propios tests: acá no importa.
vi.mock('@/components/site/PortalHeader', () => ({ default: () => <header data-portal-header /> }))
vi.mock('@/components/site/PlayerBottomNav', () => ({ PlayerBottomNav: () => null }))
vi.mock('@/components/site/PortalSessionProvider', () => ({
  PortalSessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/modules/auth/sign-out.action', () => ({ signOutAction: vi.fn() }))

const searchStr = vi.fn(() => '')
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchStr()),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': mocks.userAgent }),
}))

vi.mock('@/app/(auth)/ingresar/actions', () => ({
  playerLoginAction: vi.fn(),
  startGoogleLoginFromIngresar: vi.fn(),
}))

import IngresarPage from '@/app/(auth)/ingresar/page'

const INSTAGRAM_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 340.0.0.18.109 (iPhone14,5; iOS 17_5; es_AR)'

beforeEach(() => {
  searchStr.mockReturnValue('')
  mocks.userAgent = ''
})
afterEach(cleanup)

const renderPage = async () => render(await IngresarPage())
const buttonNames = () => screen.getAllByRole('button').map((b) => b.textContent)

describe('IngresarPage — acceso jugador', () => {
  it('renderiza el form de email con el submit "Mandame el link"', async () => {
    await renderPage()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /mandame el link/i })).toBeTruthy()
  })

  it('monta el portal de vidrio: marcador, tema propio, foto del hero y tarjeta de vidrio', async () => {
    const { container } = await renderPage()
    const frame = container.querySelector('[data-auth-frame]')
    expect(frame?.hasAttribute('data-portal-glass')).toBe(true)
    // Sigue el tema (claro u oscuro): ya no fuerza `dark` ni pinta el fondo a mano.
    expect(frame?.classList.contains('dark')).toBe(false)
    expect(frame?.getAttribute('style')).toBeNull()
    expect(container.querySelector('[data-hero-backdrop]')).not.toBeNull()
    // Sin el panel lateral con la foto de Unsplash.
    expect(container.querySelector('[style*="unsplash"]')).toBeNull()
    expect(screen.queryByText(/te está esperando/)).toBeNull()
    expect(container.querySelector('.pa-auth__card.glass')).not.toBeNull()
    const title = screen.getByRole('heading', { level: 1, name: 'Entrá a tu cuenta' })
    expect(title.className).toMatch(/\bpa-auth__title\b/)
    // 52 px (`h-13`) y 16 px en el celular: GLASS_INPUT, con borde de campo (3:1).
    const email = screen.getByLabelText(/email/i)
    expect(email.className).toMatch(/\bh-13\b/)
    expect(email.className).toMatch(/\btext-base\b/)
    expect(email.className).toMatch(/\bmd:text-base\b/)
    expect(email.className).not.toMatch(/border-white|ring-emerald-500/)
  })

  it('muestra el aviso de cuenta eliminada con ?deleted=1', async () => {
    searchStr.mockReturnValue('deleted=1')
    await renderPage()
    expect(screen.getByText(/tu cuenta fue eliminada/i)).toBeTruthy()
  })

  it('ofrece reservar en Explorar para primera vez', async () => {
    await renderPage()
    const link = screen.getByRole('link', { name: /Buscá complejos/i })
    expect(link.getAttribute('href')).toBe('/explorar')
  })

  it('en un navegador común va primero Google; en el de Instagram, el email y después un Google que abre el navegador', async () => {
    mocks.userAgent =
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
    await renderPage()
    expect(buttonNames()).toEqual(['Continuar con Google', 'Mandame el link'])
    expect(screen.queryByText('Te abrimos tu navegador para que entres con Google.')).toBeNull()
    cleanup()

    mocks.userAgent = INSTAGRAM_UA
    await renderPage()
    expect(buttonNames()).toEqual(['Mandame el link', 'Continuar con Google'])
    expect(screen.getByText('Te abrimos tu navegador para que entres con Google.')).toBeTruthy()
  })
})

describe('IngresarPage — copy según el destino (next)', () => {
  const h1 = () => screen.getByRole('heading', { level: 1 }).textContent

  it('next=/rival/mis-partidos: "Entrá a tus partidos" y primera vez hacia /rival/nuevo', async () => {
    const node = await IngresarPage({
      searchParams: Promise.resolve({ next: '/rival/mis-partidos' }),
    })
    render(node)
    expect(h1()).toBe('Entrá a tus partidos')
    expect(screen.getByRole('link', { name: 'armá tu primer partido' }).getAttribute('href')).toBe(
      '/rival/nuevo',
    )
    expect(screen.queryByRole('link', { name: /Buscá complejos/i })).toBeNull()
  })

  it('next=/rival/tablon: "Entrá a RIVAL"', async () => {
    render(await IngresarPage({ searchParams: Promise.resolve({ next: '/rival/tablon' }) }))
    expect(h1()).toBe('Entrá a RIVAL')
  })

  it.each([
    undefined,
    '/mis-reservas',
    '/rivalidad',
    '//evil.com',
    'https://evil.com',
    '/\\evil.com',
  ])('next=%s no activa RIVAL: sigue "Entrá a tu cuenta"', async (next) => {
    render(await IngresarPage({ searchParams: Promise.resolve({ next }) }))
    expect(h1()).toBe('Entrá a tu cuenta')
  })

  it('un next repetido (array) tampoco activa RIVAL', async () => {
    render(await IngresarPage({ searchParams: Promise.resolve({ next: ['/rival/tablon', '/x'] }) }))
    expect(h1()).toBe('Entrá a tu cuenta')
  })
})
