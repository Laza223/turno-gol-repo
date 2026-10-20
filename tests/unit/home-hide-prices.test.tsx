// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { Hero } from '@/app/home/Hero'
import { NearbyPanel } from '@/app/home/NearbyPanel'
import { NearbyProvider } from '@/app/home/nearby-context'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'
import { availabilityResponse } from '@/test/fixtures/public'

const CITIES = cityCounts()

function stubGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: (pos: { coords: Record<string, number> }) => void) =>
        success({ coords: { latitude: -34.5703, longitude: -59.105 } }),
    },
  })
}

/** El servidor manda `fromPriceCents: null` cuando el complejo oculta precios. */
function stubApi(fromPriceCents: number | null) {
  const results = [
    publicTenantCard({ id: 'a', slug: 'a', name: 'Cancha A', distanceKm: 3, fromPriceCents }),
    publicTenantCard({ id: 'b', slug: 'b', name: 'Cancha B', distanceKm: 6, fromPriceCents }),
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.startsWith('/api/public/search')
            ? { results, total: results.length }
            : availabilityResponse({ date: '2026-09-27' }),
      }),
    ),
  )
}

function ariaLabels(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '')
}

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

describe('precios ocultos en la home', () => {
  it('Hero con hidePrices: ningún $ en el DOM ni en un aria-label, y no hay "Turno desde"', async () => {
    stubGeolocation()
    stubApi(null)
    const { container } = render(<Hero cities={CITIES} />)
    await screen.findByRole('link', { name: /Reservar hoy a las 10:00$/ })
    expect(container.textContent).not.toContain('$')
    expect(container.textContent).not.toContain('Turno desde')
    expect(ariaLabels(container).filter((l) => l.includes('$'))).toEqual([])
  })

  it('NearbyPanel con hidePrices: ningún $ en el DOM ni en un aria-label', async () => {
    stubGeolocation()
    stubApi(null)
    const { container } = render(
      <NearbyProvider>
        <NearbyPanel cities={CITIES} />
      </NearbyProvider>,
    )
    await screen.findByRole('link', { name: /Reservar hoy a las 10:00$/ })
    expect(container.textContent).not.toContain('$')
    expect(ariaLabels(container).filter((l) => l.includes('$'))).toEqual([])
  })

  it('control: con precio cargado, "Turno desde" y el $ SÍ aparecen', async () => {
    stubGeolocation()
    stubApi(6000000)
    const { container } = render(<Hero cities={CITIES} />)
    await waitFor(() => expect(container.textContent).toContain('Turno desde'))
    expect(container.textContent).toContain('$')
  })
})
