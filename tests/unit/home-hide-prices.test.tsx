// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { Hero } from '@/app/home/Hero'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'

/**
 * El hero no muestra datos de complejos: la geolocalización solo se usa para sugerir la
 * localidad (`useNearestCity` lee `city`/`province` y descarta el resto). Por eso un complejo
 * que oculta precios (`fromPriceCents: null`) no puede filtrar nada a la home. Control: el
 * resultado del API trae un nombre y la home entera no tiene ningún `$` (no hay precios inventados).
 */
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

describe('precios ocultos en la home', () => {
  it('ningún dato del complejo cercano (nombre, precio) llega al DOM', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (pos: { coords: Record<string, number> }) => void) =>
          success({ coords: { latitude: -34.5703, longitude: -59.105 } }),
      },
    })
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          results: [
            publicTenantCard({ id: 'a', slug: 'a', name: 'Cancha Secreta', fromPriceCents: null }),
          ],
          total: 1,
          url,
        }),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<Hero cities={cityCounts()} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))

    expect(container.textContent).not.toContain('Cancha Secreta')
    expect(container.textContent).not.toContain('Turno desde')
    expect(container.textContent).not.toContain('$')
    expect(container.querySelector('[aria-label*="Cancha Secreta"]')).toBeNull()
  })
})
