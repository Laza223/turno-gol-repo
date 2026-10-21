// @vitest-environment happy-dom
//
// La page de /ingresar con React real. El panel de "enviado", el reenvío y el corte de red
// viven en ingresar-resend.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ userAgent: '' }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

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
  it('renderiza el form de email con el submit "Mandame el enlace"', async () => {
    await renderPage()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /mandame el enlace/i })).toBeTruthy()
  })

  it('monta el look de La Previa: marco oscuro y título en Archivo negra itálica', async () => {
    const { container } = await renderPage()
    const frame = container.querySelector('[data-auth-frame]')
    expect(frame?.classList.contains('dark')).toBe(true)
    expect(container.querySelector('[data-world]')).toBeNull()
    const title = screen.getByRole('heading', { level: 1, name: 'Accedé a tu cuenta' })
    expect(title.className).toMatch(/\bfont-black\b/)
    expect(title.className).toMatch(/\bitalic\b/)
    // 48 px y 16 px en el celular aunque el fondo sea de vidrio; el borde sigue siendo `border-input`
    // (3:1) del primitivo: la receta vieja de `border-white/10` no pasaba AA.
    const email = screen.getByLabelText(/email/i)
    expect(email.className).toMatch(/\bh-12\b/)
    expect(email.className).toMatch(/\btext-base\b/)
    expect(email.className).not.toMatch(/border-white|ring-emerald-500/)
  })

  it('muestra el aviso de cuenta eliminada con ?deleted=1', async () => {
    searchStr.mockReturnValue('deleted=1')
    await renderPage()
    expect(screen.getByText(/tu cuenta fue eliminada/i)).toBeTruthy()
  })

  it('ofrece reservar en Explorar para primera vez', async () => {
    await renderPage()
    const link = screen.getByRole('link', { name: /Descubrí complejos/i })
    expect(link.getAttribute('href')).toBe('/explorar')
  })

  it('en un navegador común va primero Google; en el de Instagram, el email', async () => {
    mocks.userAgent =
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
    await renderPage()
    expect(buttonNames()).toEqual(['Continuar con Google', 'Mandame el enlace'])
    expect(screen.queryByText(/Google puede no abrirse/)).toBeNull()
    cleanup()

    mocks.userAgent = INSTAGRAM_UA
    await renderPage()
    expect(buttonNames()).toEqual(['Mandame el enlace', 'Continuar con Google'])
    expect(screen.getByText(/Google puede no abrirse/)).toBeTruthy()
  })
})
