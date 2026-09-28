import { useEffect, useState } from 'react'
import type { Decorator } from '@storybook/nextjs-vite'

export type GeoState = 'found' | 'denied' | 'unsupported' | 'pending'

/** Plaza Colón, Luján: el punto desde el que se piensa el hero ("a lo sumo, Rodríguez"). */
const LUJAN = { latitude: -34.5703, longitude: -59.105 }

/**
 * El hero llama `navigator.geolocation.getCurrentPosition` en el PRIMER efecto
 * tras montar: sin mock dispararía un permiso real de geolocalización en el
 * browser de Playwright (no determinista). Se stubea síncronamente (gate
 * `ready`, mismo patrón que `withFetch`) y se restaura al desmontar. "found"
 * además pega a `/api/public/*`, que se mockea con `parameters.fetchMock`.
 */
export function withGeolocation(state: GeoState): Decorator {
  // PascalCase y con nombre: react-hooks/rules-of-hooks exige que la función
  // que llama useState/useEffect "parezca" un componente o un hook.
  function GeolocationDecorator(Story: Parameters<Decorator>[0]) {
    const [ready, setReady] = useState(false)
    useEffect(() => {
      if (state === 'unsupported') {
        Object.defineProperty(window.navigator, 'geolocation', {
          value: undefined,
          configurable: true,
        })
      } else {
        const mock: Pick<Geolocation, 'getCurrentPosition'> = {
          getCurrentPosition: (success, error) => {
            if (state === 'pending') return
            if (state === 'denied') {
              error?.({ code: 1, message: 'denied' } as GeolocationPositionError)
              return
            }
            success({
              coords: {
                ...LUJAN,
                accuracy: 10,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as GeolocationPosition)
          },
        }
        Object.defineProperty(window.navigator, 'geolocation', { value: mock, configurable: true })
      }
      setReady(true)
      // `defineProperty` crea una propiedad OWN que tapa el getter real de
      // `Navigator.prototype`; borrarla al desmontar restaura el prototype para
      // no filtrar el mock a otras stories del mismo browser context.
      return () => {
        Reflect.deleteProperty(window.navigator, 'geolocation')
      }
    }, [])
    if (!ready) return <></>
    return <Story />
  }
  return GeolocationDecorator
}
