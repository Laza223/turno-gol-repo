'use client'

import { useEffect, useState } from 'react'
import { normalizeForSearch } from '@/lib/search'
import type { GeoLocalitiesResponse, GeoLocality } from '@/modules/geo/geo.types'

export type LocalitySearchStatus = 'idle' | 'loading' | 'done' | 'degraded' | 'error'

type Settled = { results: GeoLocality[]; status: 'done' | 'degraded' | 'error' }

const CACHE_MAX = 50
/** Solo respuestas buenas: un "degradado" o un error no se recuerdan, el próximo intento vuelve a pedir. */
const cache = new Map<string, Settled>()

function remember(key: string, value: Settled) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

function isLocalitiesResponse(body: unknown): body is GeoLocalitiesResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'results' in body &&
    Array.isArray((body as { results: unknown }).results)
  )
}

/**
 * Busca localidades de todo el país mientras se escribe. Sin UI: lo usan el
 * `LocalityPicker` y el buscador del jugador, cada uno con su estilo.
 * Debounce, cancela la consulta anterior y no pide por debajo de `minChars`.
 * Un error de red nunca tira: queda en `status: 'error'`.
 */
export function useLocalitySearch(
  query: string,
  { minChars = 2, debounceMs = 250 }: { minChars?: number; debounceMs?: number } = {},
): { results: GeoLocality[]; status: LocalitySearchStatus } {
  const key = normalizeForSearch(query)
  const enabled = key.length >= minChars
  const [settled, setSettled] = useState<(Settled & { key: string }) | null>(null)

  useEffect(() => {
    if (!enabled || cache.has(key)) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/public/geo/localidades?q=${encodeURIComponent(key)}`, {
            signal: controller.signal,
          })
          if (!res.ok) {
            setSettled({ key, results: [], status: 'error' })
            return
          }
          const body: unknown = await res.json()
          if (!isLocalitiesResponse(body)) {
            setSettled({ key, results: [], status: 'error' })
            return
          }
          const next: Settled = body.degraded
            ? { results: [], status: 'degraded' }
            : { results: body.results, status: 'done' }
          if (next.status === 'done') remember(key, next)
          setSettled({ key, ...next })
        } catch {
          if (controller.signal.aborted) return
          setSettled({ key, results: [], status: 'error' })
        }
      })()
    }, debounceMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, enabled, debounceMs])

  if (!enabled) return { results: [], status: 'idle' }
  const hit = settled?.key === key ? settled : cache.get(key)
  if (hit) return { results: hit.results, status: hit.status }
  return { results: [], status: 'loading' }
}
