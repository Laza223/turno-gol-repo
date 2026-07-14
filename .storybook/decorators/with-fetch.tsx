import type { Decorator } from '@storybook/nextjs-vite'
import { useEffect, useState } from 'react'

/**
 * Capa de red de las stories, sin MSW.
 *
 * MSW no intercepta el WebSocket de Supabase Realtime (use-booking-realtime.ts),
 * así que igual haría falta un module mock para ese camino — y `msw-storybook-addon`
 * exige commitear `public/mockServiceWorker.js` dentro del `public/` que se sirve
 * en producción. Los únicos endpoints que las stories tocan son 3 JSON same-origin,
 * así que una tabla de rutas sobre `window.fetch` alcanza y no agrega dependencias.
 */
export type FetchRoute = {
  /** Se matchea contra la URL del request con String.includes. */
  match: string
  /**
   * Una respuesta, o una SECUENCIA que se consume de a una por llamada. La
   * secuencia es lo que permite scriptear el polling de PaymentStatusWatcher
   * (pending → pending → confirmed) sin depender de timers reales.
   */
  json: unknown
  status?: number
}

export type FetchRoutes = FetchRoute[]

export const withFetch: Decorator = (Story, ctx) => {
  const routes = ctx.parameters['fetchMock'] as FetchRoutes | undefined
  const [ready, setReady] = useState(!routes)

  useEffect(() => {
    if (!routes) return
    const real = window.fetch
    const cursors = new Map<string, number>()

    window.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      const route = routes.find((r) => url.includes(r.match))
      if (!route) {
        // Un request no declarado es un bug de la story, no un caso a tolerar:
        // significa que un componente se escapó a la red de verdad.
        console.error(`[storybook] fetch no mockeado: ${url}`)
        return new Response('null', { status: 404 })
      }

      let body = route.json
      if (Array.isArray(route.json)) {
        const i = cursors.get(route.match) ?? 0
        body = route.json[Math.min(i, route.json.length - 1)]
        cursors.set(route.match, i + 1)
      }
      return new Response(JSON.stringify(body), {
        status: route.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof window.fetch

    setReady(true)
    return () => {
      window.fetch = real
    }
  }, [routes])

  // No renderizar hasta que el stub esté puesto: PortalSessionProvider y
  // PaymentStatusWatcher disparan su fetch en el PRIMER efecto tras montar.
  if (!ready) return <></>
  return <Story />
}
