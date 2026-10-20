// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NearbyPanel } from '@/app/home/NearbyPanel'
import { NearbyProvider } from '@/app/home/nearby-context'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'
import { availabilityResponse } from '@/test/fixtures/public'

function stubGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: (pos: { coords: Record<string, number> }) => void) =>
        success({ coords: { latitude: -34.5703, longitude: -59.105 } }),
    },
  })
}

/** Dos complejos (tarjeta principal + una fila); la disponibilidad responde `availability`. */
function stubApi(availability: () => Promise<unknown>) {
  const results = [
    publicTenantCard({ id: 'a', slug: 'cancha-a', name: 'Cancha A', distanceKm: 3 }),
    publicTenantCard({ id: 'b', slug: 'cancha-b', name: 'Cancha B', distanceKm: 6 }),
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.startsWith('/api/public/search')
        ? Promise.resolve({ ok: true, json: async () => ({ results, total: 2 }) })
        : availability(),
    ),
  )
}

function renderPanel() {
  return render(
    <NearbyProvider>
      <NearbyPanel cities={cityCounts()} />
    </NearbyProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

describe('NearbyPanel: disponibilidad que no cargó ≠ "no hay turnos"', () => {
  it('slots null: la tarjeta y la fila dicen que no cargó; la tarjeta ofrece la ficha', async () => {
    stubGeolocation()
    stubApi(() => Promise.resolve({ ok: false, status: 429, json: async () => ({}) }))
    renderPanel()

    expect(await screen.findAllByText(/No pudimos cargar los horarios/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Ver el complejo' }).getAttribute('href')).toBe(
      '/cancha-a',
    )
    expect(screen.queryByText(/no le quedan turnos/i)).toBeNull()
    expect(screen.queryByText(/Sin turnos hoy/)).toBeNull()
  })

  it('control: cargó y no hay horarios → "no hay turnos", sin el aviso de falla', async () => {
    stubGeolocation()
    stubApi(() =>
      Promise.resolve({
        ok: true,
        json: async () => availabilityResponse({ date: '2026-09-27', courts: [] }),
      }),
    )
    renderPanel()

    expect(await screen.findByText(/Hoy no le quedan turnos libres/)).toBeTruthy()
    expect(screen.getByText('Sin turnos hoy')).toBeTruthy()
    expect(screen.queryByText(/No pudimos cargar los horarios/)).toBeNull()
  })
})
