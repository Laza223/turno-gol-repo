// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Mockear el client island para evitar timers/redirect en el test del server
// component; solo verificamos que recibe el next sanitizado.
vi.mock('@/app/(auth)/verify/SuccessRedirect', () => ({
  default: ({ next }: { next: string }) => <div data-testid="redirect" data-next={next} />,
}))

import VerifyPage from '@/app/(auth)/verify/page'

afterEach(() => cleanup())

async function renderPage(searchParams: Record<string, string>) {
  // Next 16: searchParams es una Promise, así que VerifyPage pasó a ser async.
  // Se invoca, se awaitea y se renderiza el elemento resultante.
  return render(await VerifyPage({ searchParams: Promise.resolve(searchParams) }))
}

describe('VerifyPage — estado de éxito', () => {
  it('intent booking: copy de reserva + botón al next', async () => {
    await renderPage({ status: 'success', next: '/club-norte/reservar?court=1', intent: 'booking' })
    expect(screen.getByText(/cuenta confirmada/i)).toBeTruthy()
    expect(screen.getByText(/terminar tu reserva/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: /continuar con mi reserva/i })
    expect(link.getAttribute('href')).toBe('/club-norte/reservar?court=1')
  })

  it('intent login: copy genérico + botón a mis reservas', async () => {
    await renderPage({ status: 'success', next: '/mis-reservas', intent: 'login' })
    expect(screen.getByText(/iniciaste sesión/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ir a mis reservas/i }).getAttribute('href')).toBe('/mis-reservas')
  })

  it('intent signup: bienvenida + botón al panel', async () => {
    await renderPage({ status: 'success', next: '/dashboard', intent: 'signup' })
    expect(screen.getByText(/bienvenido a turnogol/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ir al panel/i }).getAttribute('href')).toBe('/dashboard')
  })

  it('next malicioso cae al fallback /mis-reservas', async () => {
    await renderPage({ status: 'success', next: '//evil.com', intent: 'login' })
    expect(screen.getByRole('link', { name: /ir a mis reservas/i }).getAttribute('href')).toBe('/mis-reservas')
    expect(screen.getByTestId('redirect').getAttribute('data-next')).toBe('/mis-reservas')
  })

  it('intent inválido cae a login', async () => {
    await renderPage({ status: 'success', next: '/mis-reservas', intent: 'hacker' })
    expect(screen.getByText(/iniciaste sesión/i)).toBeTruthy()
  })

  it('muestra la pista cross-device', async () => {
    await renderPage({ status: 'success', next: '/mis-reservas', intent: 'login' })
    expect(screen.getByText(/otro dispositivo/i)).toBeTruthy()
  })

  it('con ?error sigue mostrando el estado de error', async () => {
    await renderPage({ error: 'expired' })
    expect(screen.getByText(/no pudimos verificar tu enlace/i)).toBeTruthy()
  })
})
