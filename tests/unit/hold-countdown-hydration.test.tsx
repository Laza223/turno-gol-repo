// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { BookingCard } from '@/components/booking/BookingCard'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * El contador de la seña en curso de la grilla del staff se pinta en el
 * servidor y se hidrata en el navegador, cada uno con su reloj. Si el texto
 * depende de la hora en el primer render, los dos casi nunca coinciden y React
 * tira "Hydration failed" y regenera la grilla entera en el cliente. Pasó en
 * CI de main (visual de la grilla): servidor "liberando…", cliente "5:00".
 *
 * La prueba reproduce exactamente eso: SSR a las T, hidratación a las T+2 s.
 */

const T0 = new Date('2026-09-12T20:00:00.000Z').getTime()

const pendingBooking: GridBooking = {
  id: 'b-1',
  courtId: 'c-1',
  date: '2026-09-12',
  timeStart: '17:00',
  timeEnd: '18:00',
  status: 'pending_payment',
  type: 'spontaneous',
  guestName: 'Martina Sosa',
  playerFirstName: null,
  playerLastName: null,
  priceSnapshot: 4_000_000,
  // Hold creado 1 min antes del SSR: el contador tiene mm:ss que ir corriendo.
  createdAt: new Date(T0 - 60_000).toISOString(),
}

function card() {
  return (
    <BookingCard
      booking={pendingBooking}
      timeStart="17:00"
      isPast={false}
      col={0}
      row={0}
      courtName="Cancha 1"
    />
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('HoldCountdown — hidratación', () => {
  it('no produce hydration mismatch aunque el reloj avance entre SSR e hidratación', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })

    vi.setSystemTime(T0)
    const html = renderToString(card())

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    vi.setSystemTime(T0 + 2_000)
    const recoverable = vi.fn()
    await act(async () => {
      hydrateRoot(container, card(), { onRecoverableError: recoverable })
    })

    expect(recoverable).not.toHaveBeenCalled()
    // Después de hidratar, el contador muestra el tiempo real y no el placeholder.
    expect(container.textContent).toMatch(/\d:\d\d/)

    container.remove()
  })
})
