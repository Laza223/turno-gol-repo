// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
// Las fotos del hero son imports estáticos (en vitest llegan como string, sin width/height).
vi.mock('next/image', () => ({ default: () => null }))

import { Hero } from '@/app/home/Hero'
import { cityCounts, publicTenantCard } from '@/test/fixtures/tenant'

/**
 * La home muestra, en la ventana del hero, los complejos reales de la localidad (nombre, formatos,
 * horas libres de hoy), pero NUNCA sus precios: ni "Turno desde" ni ningún monto, aunque el API los
 * mande. Control doble: el complejo del API trae precio (`fromPriceCents`) y aun así aparece solo
 * su nombre, sin ningún `$` en el hero. (El dibujo de "Reservás en una pantalla", más abajo, lleva
 * un precio de ejemplo rotulado "Ejemplo": no es el de ningún complejo y no entra acá.)
 */
// Los archivos de test comparten worker: una zona guardada por otro archivo haría que la home no
// busque la ubicación y la ventana no aparezca. Se arranca siempre sin zona.
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
})

describe('precios ocultos en la home', () => {
  it('el complejo cercano aparece por nombre, pero ningún precio llega al DOM', async () => {
    // La home solo consulta la ubicación sola cuando el permiso YA está concedido (no hay cartel);
    // en cualquier otro caso espera al botón "Usar mi ubicación actual".
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: () => Promise.resolve({ state: 'granted' }) },
    })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (pos: { coords: Record<string, number> }) => void) =>
          success({ coords: { latitude: -34.5703, longitude: -59.105 } }),
      },
    })
    // "Usar mi ubicación" pregunta dónde está el punto (`/api/public/geo/reverse`) y la ventana de
    // la home busca los complejos de esa localidad (`/api/public/search`).
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.includes('/api/public/geo/reverse')
            ? {
                result: {
                  city: 'Luján',
                  province: 'Buenos Aires',
                  lat: -34.5703,
                  lng: -59.105,
                },
              }
            : {
                results: [
                  publicTenantCard({
                    id: 'a',
                    slug: 'a',
                    name: 'Cancha Secreta',
                    fromPriceCents: 900000,
                    fromPricePerPlayerCents: 90000,
                  }),
                ],
                total: 1,
                url,
              },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<Hero cities={cityCounts()} />)
    // La ventana de la home lo muestra (con la zona detectada); lo que nunca muestra es plata.
    await waitFor(() => expect(container.textContent).toContain('Cancha Secreta'))
    await new Promise((r) => setTimeout(r, 0))

    expect(container.textContent).not.toContain('Turno desde')
    expect(container.textContent).not.toContain('$')
    expect(container.textContent).not.toMatch(/\d{1,3}\.\d{3}/)
  })
})
