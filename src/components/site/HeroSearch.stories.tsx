import { useEffect, useState } from 'react'
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
import { cityCounts } from '@/test/fixtures/tenant'
import HeroSearch from './HeroSearch'

type GeoState = 'found' | 'denied' | 'unsupported' | 'pending'

/**
 * `useNearestCity` llama `navigator.geolocation.getCurrentPosition` en el
 * PRIMER efecto tras montar — sin mock dispararía un permiso real de
 * geolocalización en el browser real de Playwright (no determinista). Se
 * stubea síncronamente (gate `ready`, mismo patrón que el `withFetch` global)
 * y se restaura al desmontar. El resultado "found" además pega a
 * `/api/public/search` (mockeado vía `parameters.fetchMock`, decorator
 * global `withFetch`).
 */
function withGeolocation(state: GeoState): Decorator {
  // Nombrado y en PascalCase (no una arrow anónima): react-hooks/rules-of-hooks
  // exige que la función que llama useState/useEffect "parezca" un componente
  // (mayúscula inicial) o un hook (prefijo `use`).
  function GeolocationDecorator(Story: Parameters<Decorator>[0]) {
    const [ready, setReady] = useState(false)
    useEffect(() => {
      if (state === 'unsupported') {
        Object.defineProperty(window.navigator, 'geolocation', { value: undefined, configurable: true })
      } else {
        const mock: Pick<Geolocation, 'getCurrentPosition'> = {
          getCurrentPosition: (success, error) => {
            if (state === 'pending') return
            if (state === 'denied') {
              error?.({ code: 1, message: 'denied' } as GeolocationPositionError)
              return
            }
            success({
              coords: { latitude: -34.92, longitude: -57.95, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
              timestamp: Date.now(),
            } as GeolocationPosition)
          },
        }
        Object.defineProperty(window.navigator, 'geolocation', { value: mock, configurable: true })
      }
      setReady(true)
      // `defineProperty` crea una propiedad OWN que tapa el getter real de
      // `Navigator.prototype`; borrarla al desmontar restaura el fallback al
      // prototype para no filtrar el mock a otras stories del mismo browser context.
      return () => {
        Reflect.deleteProperty(window.navigator, 'geolocation')
      }
    }, [])
    if (!ready) return <></>
    return <Story />
  }
  return GeolocationDecorator
}

const meta = {
  title: 'Public/HeroSearch',
  component: HeroSearch,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
  args: { cities: cityCounts() },
} satisfies Meta<typeof HeroSearch>

export default meta
type Story = StoryObj<typeof meta>

/** Layout horizontal (landing) — geolocalización todavía resolviendo, sin mensaje. */
export const Horizontal: Story = {
  decorators: [withGeolocation('pending')],
}

/** Layout vertical (banda de /explorar). */
export const Vertical: Story = {
  args: { layout: 'vertical' },
  decorators: [withGeolocation('pending')],
}

/** Ciudad sugerida por geolocalización — mensaje "Localidad sugerida". */
export const CiudadPrefillada: Story = {
  decorators: [withGeolocation('found')],
  parameters: {
    fetchMock: [
      {
        match: '/api/public/search',
        json: { results: [{ city: 'La Plata', province: 'Buenos Aires', distanceKm: 8 }] },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByText('Localidad sugerida según tu ubicación.')).toBeInTheDocument(),
    )
  },
}

/** Geolocalización denegada — mensaje de error, el campo queda vacío. */
export const GeolocalizacionDenegada: Story = {
  decorators: [withGeolocation('denied')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(
        canvas.getByText('No pudimos acceder a tu ubicación. Elegí tu localidad manualmente.'),
      ).toBeInTheDocument(),
    )
  },
}

/** Elegir una hora del dropdown — reemplaza "Cualquier horario". */
export const SeleccionaHora: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El <label htmlFor="hero-time"> ("Hora") gana la accessible-name computation
    // sobre el texto visible del botón ("Cualquier horario" / la hora elegida).
    await userEvent.click(canvas.getByRole('button', { name: 'Hora' }))
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('menuitem', { name: '19:00' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Hora' })).toHaveTextContent('19:00'))
  },
}

/** Submit navega a /explorar con los filtros como query params. */
export const Buscar: Story = {
  decorators: [withGeolocation('pending')],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByPlaceholderText('¿Qué club buscás?'), 'Fénix')
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar canchas' }))
    await expect(getRouter().push).toHaveBeenCalledWith('/explorar?q=F%C3%A9nix')
  },
}
