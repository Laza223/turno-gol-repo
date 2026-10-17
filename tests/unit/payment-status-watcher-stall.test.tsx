// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const { replace, refresh, pathname } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  pathname: { value: '/reserva/b1/pendiente' },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => pathname.value,
}))

import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import { TONE_TEXT } from '@/lib/status-tone'

function jsonResponse(status: string) {
  return new Response(
    JSON.stringify({ data: { status, depositStatus: 'pending', expiresAt: '' } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

const WATCHED = { bookingId: 'b1', tenantSlug: 'club-norte', date: '2026-10-17' }

beforeEach(() => {
  vi.useFakeTimers()
  pathname.value = '/reserva/b1/pendiente'
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  replace.mockClear()
  refresh.mockClear()
})

describe('PaymentStatusWatcher — no quedar colgado (#45/#46/#48)', () => {
  it('al agotarse el tiempo sin transición pasa a "Se acabó el tiempo" (#45/#48)', async () => {
    global.fetch = vi.fn(async () => jsonResponse('pending_payment')) as never
    // expiró hace 6s → ms = -6000 + 5000 = -1000 ≤ 0 al montar
    const past = new Date(Date.now() - 6000).toISOString()

    const { container } = render(
      <PaymentStatusWatcher {...WATCHED} initialStatus="pending_payment" expiresAt={past} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(screen.getByText('Se acabó el tiempo')).toBeTruthy()
    expect(screen.queryByText('Confirmando tu pago…')).toBeNull()
    // Gris: que MercadoPago tarde no es una falla (rojo es "No pudimos verificar tu pago").
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(TONE_TEXT.neutral)
    // Si el pago se aprueba después del hold la reserva NO se confirma sola y no sale el mail de
    // confirmación (sale el de la devolución de la seña, que no es una confirmación):
    // la pantalla manda a mirar Mis reservas y al complejo, sin prometer nada.
    expect(container.textContent).toContain(
      'No recibimos la confirmación de MercadoPago a tiempo. En Mis reservas ves si el turno quedó confirmado. Si pagaste y no aparece, escribile al complejo.',
    )
    expect(container.textContent).not.toMatch(/email|te avisamos|te confirmamos|acredite/i)
    expect(screen.getByRole('link', { name: 'Ver mis reservas' }).getAttribute('href')).toBe(
      '/mis-reservas',
    )
  })

  it('tras 5 fallos de polling muestra error y CTA, sin spinner infinito (#46)', async () => {
    global.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as never
    const future = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const { container } = render(
      <PaymentStatusWatcher {...WATCHED} initialStatus="pending_payment" expiresAt={future} />,
    )
    // Backoff exponencial (#63): fallos en t=3s, 9s, 21s, 45s, 75s → 5to fallo corta.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000)
    })

    expect(screen.getByText('No pudimos verificar tu pago')).toBeTruthy()
    // Rojo: la verificación falló.
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(TONE_TEXT.destructive)
    expect(screen.getByRole('link', { name: 'Ver mis reservas' })).toBeTruthy()
    expect(container.textContent).toContain('En Mis reservas ves si el turno quedó confirmado.')
    expect(container.textContent).not.toMatch(/email|te avisamos|te confirmamos|acredite/i)
  })
})

describe('PaymentStatusWatcher — la espera', () => {
  const future = () => new Date(Date.now() + 5 * 60 * 1000).toISOString()

  it('dice que está confirmando y NO muestra cuenta regresiva (todo el que llega ya pasó por MP)', async () => {
    global.fetch = vi.fn(async () => jsonResponse('pending_payment')) as never
    const { container } = render(
      <PaymentStatusWatcher {...WATCHED} initialStatus="pending_payment" expiresAt={future()} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(screen.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeTruthy()
    expect(screen.getByText('Esto puede tardar unos segundos.')).toBeTruthy()
    expect(container.textContent).not.toMatch(/te queda/i)
    expect(container.textContent).not.toMatch(/\d:\d\d/)
  })

  it('a los 30 s sin novedades suma la nota (el email llega si se confirma; también se ve en Mis reservas)', async () => {
    global.fetch = vi.fn(async () => jsonResponse('pending_payment')) as never
    render(
      <PaymentStatusWatcher {...WATCHED} initialStatus="pending_payment" expiresAt={future()} />,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000)
    })
    expect(screen.queryByText(/¿Tarda\?/)).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(
      screen.getByText(
        '¿Tarda? Si se confirma, te llega un email. También lo ves en Mis reservas.',
      ),
    ).toBeTruthy()
  })
})

describe('PaymentStatusWatcher — confirmado', () => {
  const future = () => new Date(Date.now() + 15 * 60 * 1000).toISOString()

  it('si el backend confirma, navega a /exito con replace (sin pantalla intermedia propia)', async () => {
    global.fetch = vi.fn(async () => jsonResponse('confirmed')) as never
    render(
      <PaymentStatusWatcher {...WATCHED} initialStatus="pending_payment" expiresAt={future()} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/reserva/b1/exito')
    expect(refresh).not.toHaveBeenCalled()
    // Mientras navega no aparece un "¡Reserva confirmada!" propio: se sigue viendo la espera.
    expect(screen.queryByText('¡Reserva confirmada!')).toBeNull()
  })

  it('si ya estamos en /exito, vuelve a leer la página en vez de navegar a sí misma', async () => {
    pathname.value = '/reserva/b1/exito'
    global.fetch = vi.fn(async () => jsonResponse('confirmed')) as never
    render(
      <PaymentStatusWatcher {...WATCHED} initialStatus="pending_payment" expiresAt={future()} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('PaymentStatusWatcher — una sola navegación', () => {
  const future = () => new Date(Date.now() + 15 * 60 * 1000).toISOString()

  it('confirmada: re-renderizar o cambiar la ruta (ya navegó a /exito) no navega ni refresca otra vez', () => {
    global.fetch = vi.fn() as never
    const props = { ...WATCHED, initialStatus: 'confirmed', expiresAt: future() }
    const { rerender } = render(<PaymentStatusWatcher {...props} />)
    expect(replace).toHaveBeenCalledTimes(1)

    // La navegación terminó: el watcher sigue montado un instante, ya en /exito.
    pathname.value = '/reserva/b1/exito'
    rerender(<PaymentStatusWatcher {...props} />)
    rerender(<PaymentStatusWatcher {...props} />)

    expect(replace).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('PaymentStatusWatcher — estados terminales', () => {
  const future = () => new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const renderWith = (initialStatus: string) =>
    render(<PaymentStatusWatcher {...WATCHED} initialStatus={initialStatus} expiresAt={future()} />)

  it('expirada: "Reservar de nuevo" lleva a la ficha del complejo en el día de la reserva, no a la home', () => {
    renderWith('expired')
    expect(screen.getByRole('heading', { name: 'La reserva expiró' })).toBeTruthy()
    // Quien vuelve de MercadoPago puede haber pagado tarde: el pago no confirma la reserva y la seña
    // la devuelve el complejo.
    expect(
      screen.getByText(
        'No se completó el pago a tiempo y el turno quedó liberado. Si llegaste a pagar, escribile al complejo.',
      ),
    ).toBeTruthy()
    // Gris: expirar no es una falla de la pantalla (en /error, donde el pago falló, va en rojo).
    const icon = document.querySelector('svg')?.getAttribute('class')
    expect(icon).toContain(TONE_TEXT.neutral)
    expect(icon).not.toContain('text-red-700')
    expect(screen.getByRole('link', { name: 'Reservar de nuevo' }).getAttribute('href')).toBe(
      '/club-norte?date=2026-10-17',
    )
  })

  it.each(['completed', 'no_show'])(
    '%s: "Esta reserva ya pasó" y salida a Mis reservas, sin spinner',
    async (status) => {
      global.fetch = vi.fn() as never
      renderWith(status)
      expect(screen.getByRole('heading', { name: 'Esta reserva ya pasó' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Ver mis reservas' }).getAttribute('href')).toBe(
        '/mis-reservas',
      )
      expect(screen.queryByText('Confirmando tu pago…')).toBeNull()
      // Terminal: no hay polling. Hay que dejar correr el reloj: el primer sondeo sale a los 3 s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(global.fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['canceled_refunded', 'canceled_no_refund'])('%s: "Reserva cancelada"', (status) => {
    renderWith(status)
    expect(screen.getByRole('heading', { name: 'Reserva cancelada' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver mis reservas' })).toBeTruthy()
  })
})
