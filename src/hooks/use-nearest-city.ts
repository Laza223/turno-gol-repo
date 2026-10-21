'use client'

import { useEffect, useState } from 'react'
import { useClientValue } from './use-client-value'

export type NearestCityState =
  | { status: 'locating' }
  | { status: 'found'; city: string; province: string }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'no_results' }
  | { status: 'error' }

type NearestResult = { city: string; province: string; distanceKm: number | null }

// Si el complejo más cercano queda a más de esto, pre-llenar su ciudad sería
// confundir al usuario (le sugeriríamos una localidad donde no está).
const DEFAULT_MAX_DISTANCE_KM = 50

/**
 * ¿El browser tiene Geolocation API? Se lee con `useClientValue` y no con un
 * setState adentro del efecto: "este browser no soporta geolocalización" no es
 * un estado que evolucione, es un dato del entorno. `true` como valor de
 * servidor deja el primer render en 'locating', igual que antes.
 */
const readGeolocationSupported = (): boolean =>
  typeof navigator === 'undefined' ? true : Boolean(navigator.geolocation)

/**
 * Detecta la ciudad del usuario con la Geolocation API nativa + el endpoint
 * público de búsqueda existente (sort=distance, limit=1): la ciudad sugerida es
 * la del complejo visible más cercano. Sin geocoding externo — solo datos propios.
 * Los estados de fallo (denied/unsupported/error) son informativos, nunca bloqueantes.
 */
export function useNearestCity(opts?: { maxDistanceKm?: number }): NearestCityState {
  const maxDistanceKm = opts?.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM
  const supported = useClientValue(readGeolocationSupported, true)
  const [state, setState] = useState<NearestCityState>({ status: 'locating' })

  useEffect(() => {
    if (!supported) return

    let cancelled = false
    const set = (next: NearestCityState) => {
      if (!cancelled) setState(next)
    }

    async function lookupNearest(latitude: number, longitude: number): Promise<void> {
      try {
        const params = new URLSearchParams({
          sort: 'distance',
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6),
          limit: '1',
        })
        const res = await fetch(`/api/public/search?${params.toString()}`)
        if (!res.ok) {
          set({ status: 'error' })
          return
        }
        const data = (await res.json()) as { results?: NearestResult[] }
        const nearest = data.results?.[0]
        if (nearest?.city && nearest.distanceKm != null && nearest.distanceKm <= maxDistanceKm) {
          set({ status: 'found', city: nearest.city, province: nearest.province ?? '' })
        } else {
          set({ status: 'no_results' })
        }
      } catch {
        set({ status: 'error' })
      }
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void lookupNearest(pos.coords.latitude, pos.coords.longitude)
      },
      (err) => {
        // code 1 = PERMISSION_DENIED; el resto (timeout, posición no disponible) es error genérico.
        set({ status: err.code === 1 ? 'denied' : 'error' })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    )

    return () => {
      cancelled = true
    }
  }, [maxDistanceKm, supported])

  return supported ? state : UNSUPPORTED
}

const UNSUPPORTED: NearestCityState = { status: 'unsupported' }
