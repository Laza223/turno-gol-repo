// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// El router de Next es ESTABLE entre renders (está memoizado en el AppRouter); un
// mock que devolviera un objeto nuevo en cada render reiniciaría el intervalo del
// shell en cada re-render y el test mediría otra cosa.
const { refresh, router } = vi.hoisted(() => {
  const refresh = vi.fn()
  return { refresh, router: { refresh } }
})
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { HoyShell } from '@/app/(admin)/dashboard/_components/HoyShell'
import type { HoyCourt } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { BoardBooking } from '@/lib/dashboard/today-board'

/**
 * Hoy se deja abierta todo el día en el mostrador, y sin refresco propio
 * "Terminó hace 4 min" queda viejo y las reservas online nuevas no aparecen.
 * Pero refrescar por debajo de alguien que está cobrando le cambia el saldo a
 * mitad de cobro — y en una pestaña oculta es trabajo tirado. Esto fija las
 * tres reglas: cada minuto, solo si la pestaña se ve, y nunca con un modal abierto.
 */

const NOW_MS = Date.parse('2026-09-18T00:05:00Z') // 21:05 ART

const COURTS: HoyCourt[] = [
  {
    id: 'c1',
    name: 'Cancha 1',
    status: 'online',
    capacity: 10,
    pricing: { rules: [] } as unknown as HoyCourt['pricing'],
  },
]

const BOOKING = {
  id: 'b1',
  courtId: 'c1',
  date: '2026-09-18',
  timeStart: '20:00',
  timeEnd: '21:00',
  startsAtMs: Date.parse('2026-09-17T23:00:00Z'),
  endsAtMs: Date.parse('2026-09-18T00:00:00Z'),
  status: 'confirmed',
  type: 'spontaneous',
  guestName: 'Lucía Méndez',
  playerFirstName: null,
  playerLastName: null,
  priceSnapshot: 6_000_000,
  depositStatus: 'not_required',
  depositAmount: 0,
  totalPaid: 0,
  pending: 6_000_000,
} as BoardBooking

const ok = () => vi.fn(async () => ({ success: true as const }))

function shell() {
  return (
    <HoyShell
      bookings={[BOOKING]}
      courts={COURTS}
      daySlots={[]}
      occupancy={{ occupied: 1, available: 14, blocked: 0, pct: 7 }}
      dayIsClosed={false}
      canManageCourts
      serverNowMs={NOW_MS}
      actions={{
        chargeDebtAction: ok(),
        completeAndChargeBookingAction: ok(),
        addBookingChargeAction: ok(),
        markNoShowAction: ok(),
      }}
      canteen={{
        listCatalogAction: vi.fn(async () => ({ success: true as const, products: [] })),
        sellTicketAction: vi.fn() as never,
      }}
    />
  )
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockClear()
  setVisibility('visible')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  setVisibility('visible')
})

describe('HoyShell — refresco automático', () => {
  it('no refresca al montar: el primer refresco es a los 60 segundos', () => {
    render(shell())
    expect(refresh).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(59_000)
    })
    expect(refresh).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('sigue refrescando cada minuto', () => {
    render(shell())
    act(() => {
      vi.advanceTimersByTime(180_000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('con la pestaña oculta no refresca', () => {
    setVisibility('hidden')
    render(shell())
    act(() => {
      vi.advanceTimersByTime(180_000)
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('sin red no refresca: un pedido que falla haría que Next navegue y deje la página de error', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    try {
      render(shell())
      act(() => {
        vi.advanceTimersByTime(180_000)
      })
      expect(refresh).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    }
  })

  it('al volver a la pestaña refresca enseguida', () => {
    setVisibility('hidden')
    render(shell())
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('con un modal abierto NO refresca (le cambiaría el saldo a quien está cobrando) y retoma al cerrarlo', () => {
    render(shell())
    fireEvent.click(screen.getByRole('button', { name: /Lucía Méndez/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(300_000)
    })
    expect(refresh).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
