'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { roundCoord } from '@/lib/zona-storage'
import { useClientValue } from './use-client-value'
import { useSavedZona } from './use-saved-zona'

export type NearestCityState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'found'; city: string; province: string }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'no_results' }
  | { status: 'error' }

type NearestResult = { city: string; province: string; distanceKm: number | null }

type LocateOutcome =
  | { status: 'found'; city: string; province: string; lat: number; lng: number }
  | { status: 'denied' | 'no_results' | 'error' }

// Si el complejo más cercano queda a más de esto, pre-llenar su ciudad sería
// confundir al usuario (le sugeriríamos una localidad donde no está).
const DEFAULT_MAX_DISTANCE_KM = 50

/**
 * ¿El browser tiene Geolocation API? Se lee con `useClientValue` y no con un
 * setState adentro del efecto: "este browser no soporta geolocalización" no es
 * un estado que evolucione, es un dato del entorno. `true` como valor de
 * servidor deja el primer render en 'idle', igual que antes.
 */
const readGeolocationSupported = (): boolean =>
  typeof navigator === 'undefined' ? true : Boolean(navigator.geolocation)

/** Estado del permiso SIN disparar el cartel del navegador. `null` si la API no existe. */
async function readGeolocationPermission(): Promise<PermissionState | null> {
  try {
    if (!navigator.permissions) return null
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return null
  }
}

function isPermissionDenied(err: unknown): boolean {
  // code 1 = PERMISSION_DENIED; el resto (timeout, posición no disponible) es error genérico.
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 1
}

/** Pide la posición y busca el complejo visible más cercano (datos propios, sin geocoding externo). */
async function locateNearest(maxDistanceKm: number): Promise<LocateOutcome> {
  let latitude: number
  let longitude: number
  try {
    const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((pos) => resolve(pos.coords), reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 10 * 60 * 1000,
      })
    })
    latitude = coords.latitude
    longitude = coords.longitude
  } catch (err) {
    return { status: isPermissionDenied(err) ? 'denied' : 'error' }
  }

  try {
    const params = new URLSearchParams({
      sort: 'distance',
      lat: latitude.toFixed(6),
      lng: longitude.toFixed(6),
      limit: '1',
    })
    const res = await fetch(`/api/public/search?${params.toString()}`)
    if (!res.ok) return { status: 'error' }
    const data = (await res.json()) as { results?: NearestResult[] }
    const nearest = data.results?.[0]
    if (nearest?.city && nearest.distanceKm != null && nearest.distanceKm <= maxDistanceKm) {
      return {
        status: 'found',
        city: nearest.city,
        province: nearest.province ?? '',
        lat: roundCoord(latitude),
        lng: roundCoord(longitude),
      }
    }
    return { status: 'no_results' }
  } catch {
    return { status: 'error' }
  }
}

/**
 * Detecta la ciudad del usuario con la Geolocation API nativa + el endpoint
 * público de búsqueda existente (sort=distance, limit=1): la ciudad sugerida es
 * la del complejo visible más cercano.
 *
 * NUNCA pide la ubicación sola: eso mostraba el cartel del navegador en cada visita.
 * `locate()` la pide a pedido (botón "Usar mi ubicación") y, si encuentra una zona, la
 * guarda en el dispositivo (`useSavedZona`) para no volver a preguntar. La única excepción
 * es que el permiso YA esté concedido: ahí consultarla no muestra ningún cartel.
 * Los estados de fallo (denied/unsupported/error) son informativos, nunca bloqueantes.
 *
 * Ojo: el hero de la home renderiza `HeroMobile` y `HeroDesktop` a la vez (solo uno se ve),
 * así que este hook corre dos veces por carga. Con el permiso concedido son dos consultas
 * iguales y sin cartel; el botón solo existe en la instancia visible.
 */
export function useNearestCity(opts?: { maxDistanceKm?: number }): {
  state: NearestCityState
  locate: () => void
  /** Descarta la consulta en vuelo: el resultado que llegue después no se guarda ni se muestra. */
  cancel: () => void
} {
  const maxDistanceKm = opts?.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM
  const supported = useClientValue(readGeolocationSupported, true)
  const [zona, saveZona] = useSavedZona()
  const hasZona = Boolean(zona?.city)
  const [state, setState] = useState<NearestCityState>({ status: 'idle' })
  // Número de la última consulta válida: una respuesta con otro número llegó tarde y se ignora.
  const latestRun = useRef(0)

  const cancel = useCallback(() => {
    latestRun.current += 1
    setState((s) => (s.status === 'locating' ? { status: 'idle' } : s))
  }, [])

  const locate = useCallback(() => {
    const run = ++latestRun.current
    setState({ status: 'locating' })
    void locateNearest(maxDistanceKm).then((outcome) => {
      if (run !== latestRun.current) return
      if (outcome.status === 'found') {
        saveZona({
          city: outcome.city,
          province: outcome.province,
          lat: outcome.lat,
          lng: outcome.lng,
        })
        setState({ status: 'found', city: outcome.city, province: outcome.province })
      } else {
        setState({ status: outcome.status })
      }
    })
  }, [maxDistanceKm, saveZona])

  useEffect(() => {
    if (!supported || hasZona) return

    let cancelled = false
    void readGeolocationPermission().then((permission) => {
      if (cancelled) return
      if (permission === 'denied') setState({ status: 'denied' })
      else if (permission === 'granted') locate()
    })

    return () => {
      cancelled = true
      // Apareció una zona (la eligió a mano, o la guardó la otra instancia del hero): una
      // detección automática que siga en vuelo no tiene que pisarla.
      latestRun.current += 1
    }
  }, [supported, hasZona, locate])

  return { state: supported ? state : UNSUPPORTED, locate, cancel }
}

const UNSUPPORTED: NearestCityState = { status: 'unsupported' }
