// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Mockear el client island para evitar timers/redirect en el test del server
// component; solo verificamos que recibe el next sanitizado.
vi.mock('@/app/(auth)/verify/SuccessRedirect', () => ({
  default: ({ next }: { next: string }) => <div data-testid="redirect" data-next={next} />,
}))
// La page importa la Server Action de Google de /ingresar (arrastra supabase/db).
vi.mock('@/app/(auth)/ingresar/actions', () => ({ startGoogleLoginFromIngresar: vi.fn() }))

import VerifyPage from '@/app/(auth)/verify/page'

afterEach(() => cleanup())

async function renderPage(searchParams: Record<string, string>) {
  // Next 16: searchParams es una Promise, así que VerifyPage pasó a ser async.
  // Se invoca, se awaitea y se renderiza el elemento resultante.
  return render(await VerifyPage({ searchParams: Promise.resolve(searchParams) }))
}

describe('VerifyPage — estado de éxito', () => {
  it('intent login: copy genérico + botón a mis reservas', async () => {
    await renderPage({ status: 'success', next: '/mis-reservas', intent: 'login' })
    expect(screen.getByText(/iniciaste sesión/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ir a mis reservas/i }).getAttribute('href')).toBe(
      '/mis-reservas',
    )
  })

  it('login que volvía a RIVAL: el botón nombra RIVAL y vuelve a donde iba', async () => {
    await renderPage({ status: 'success', next: '/rival/nuevo', intent: 'login' })
    expect(screen.getByText('Ya estás adentro.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Volver a RIVAL' }).getAttribute('href')).toBe(
      '/rival/nuevo',
    )
    expect(screen.queryByRole('link', { name: /ir a mis reservas/i })).toBeNull()
  })

  it('un next de otra sección no hereda el copy de RIVAL', async () => {
    await renderPage({ status: 'success', next: '/rivalx', intent: 'login' })
    expect(screen.queryByRole('link', { name: 'Volver a RIVAL' })).toBeNull()
  })

  it('intent signup: bienvenida + botón al panel', async () => {
    await renderPage({ status: 'success', next: '/dashboard', intent: 'signup' })
    expect(screen.getByText(/bienvenido a turnogol/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ir al panel/i }).getAttribute('href')).toBe(
      '/dashboard',
    )
  })

  it('next malicioso cae al fallback /mis-reservas', async () => {
    await renderPage({ status: 'success', next: '//evil.com', intent: 'login' })
    expect(screen.getByRole('link', { name: /ir a mis reservas/i }).getAttribute('href')).toBe(
      '/mis-reservas',
    )
    expect(screen.getByTestId('redirect').getAttribute('data-next')).toBe('/mis-reservas')
  })

  it('un next repetido (Next lo entrega como string[]) cae al fallback sin romper', async () => {
    // `?next=a&next=b` llega como array aunque el tipo diga string: `.replace` tiraba TypeError.
    await renderPage({ status: 'success', next: ['/a', '/b'], intent: 'login' } as never)
    expect(screen.getByRole('link', { name: /ir a mis reservas/i }).getAttribute('href')).toBe(
      '/mis-reservas',
    )
  })

  it.each(['hacker', 'booking', 'booking_returning'])(
    'intent %s (inválido o retirado) cae al camino genérico de login, sin copy de reserva',
    async (intent) => {
      await renderPage({ status: 'success', next: '/club-norte/reservar?court=1', intent })
      expect(screen.getByText(/iniciaste sesión/i)).toBeTruthy()
      expect(screen.queryByText(/cuenta confirmada/i)).toBeNull()
      expect(screen.queryByText(/terminar tu reserva/i)).toBeNull()
      // El destino se respeta aunque el intent no se reconozca.
      expect(screen.getByTestId('redirect').getAttribute('data-next')).toBe(
        '/club-norte/reservar?court=1',
      )
    },
  )

  it('muestra la pista cross-device', async () => {
    await renderPage({ status: 'success', next: '/mis-reservas', intent: 'login' })
    expect(screen.getByText(/otro dispositivo/i)).toBeTruthy()
  })

  it('con ?error sigue mostrando el estado de error', async () => {
    await renderPage({ error: 'expired' })
    expect(screen.getByRole('heading', { level: 1, name: 'Este enlace venció' })).toBeTruthy()
  })
})
