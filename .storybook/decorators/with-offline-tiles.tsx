import type { Decorator } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import L from 'leaflet'

/**
 * Los 5 archivos de stories que montan un mapa (`ExplorarMap`, `BookingMiniMap`
 * y lo que los envuelve: `ExplorarSplitView`, `BookingSuccessCard`,
 * `BookingSuccessExtras`) pedían tiles reales a `{s}.tile.openstreetmap.org` —
 * tráfico saliente de verdad desde el runner de CI, sujeto al rate limiter de
 * un tercero. Una suite cuyo tiempo depende de eso es no-determinística por
 * construcción, y quedaba sin cazar porque el mock de `withFetch` intercepta
 * `window.fetch`: Leaflet pide tiles con `<img src>`, no con fetch.
 *
 * Leaflet arma esa URL en `TileLayer.getTileUrl()` — pisarlo ahí evita el
 * request sin tocar ninguno de los dos componentes de producción (siguen
 * usando la URL real de OSM fuera de Storybook).
 */
const BLANK_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'

export const withOfflineTiles: Decorator = (Story) => {
  useEffect(() => {
    const original = L.TileLayer.prototype.getTileUrl
    L.TileLayer.prototype.getTileUrl = () => BLANK_TILE
    return () => {
      L.TileLayer.prototype.getTileUrl = original
    }
  }, [])

  return <Story />
}
