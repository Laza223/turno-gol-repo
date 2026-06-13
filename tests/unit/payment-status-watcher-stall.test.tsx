// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'

function jsonResponse(status: string) {
  return new Response(
    JSON.stringify({ data: { status, depositStatus: 'pending', expiresAt: '' } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PaymentStatusWatcher — no quedar colgado (#45/#46/#48)', () => {
  it('al agotarse el tiempo sin transición pasa a "Se acabó el tiempo" (#45/#48)', async () => {
    global.fetch = vi.fn(async () => jsonResponse('pending_payment')) as never
    // expiró hace 6s → ms = -6000 + 5000 = -1000 ≤ 0 al montar
    const past = new Date(Date.now() - 6000).toISOString()

    render(
      <PaymentStatusWatcher bookingId="b1" initialStatus="pending_payment" expiresAt={past} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(screen.getByText('Se acabó el tiempo')).toBeTruthy()
    expect(screen.queryByText('Confirmando tu pago…')).toBeNull()
  })

  it('tras 5 fallos de polling muestra error y CTA, sin spinner infinito (#46)', async () => {
    global.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as never
    const future = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    render(
      <PaymentStatusWatcher bookingId="b1" initialStatus="pending_payment" expiresAt={future} />,
    )
    // Backoff exponencial (#63): fallos en t=3s, 9s, 21s, 45s, 75s → 5to fallo corta.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000)
    })

    expect(screen.getByText('No pudimos verificar tu pago')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver mis reservas' })).toBeTruthy()
  })

  it('si el backend confirma antes de expirar, muestra la reserva confirmada', async () => {
    global.fetch = vi.fn(async () => jsonResponse('confirmed')) as never
    const future = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    render(
      <PaymentStatusWatcher bookingId="b1" initialStatus="pending_payment" expiresAt={future} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    expect(screen.getByText('¡Reserva confirmada!')).toBeTruthy()
  })
})
