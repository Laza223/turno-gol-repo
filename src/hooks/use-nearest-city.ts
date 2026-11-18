'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCurrentPlace, type CurrentPlaceState } from '@/components/geo/use-current-place'
import { roundCoord } from '@/lib/zona-storage'
import { useClientValue } from './use-client-value'
import { useSavedZona } from './use-saved-zona'

/** `found` trae la localidad real del jugador, con coordenadas a ~1 km (las mismas que se guardan). */
export type NearestCityState =
  | Exclude<CurrentPlaceState, { status: 'found' }>
  | { status: 'found'; city: string; province: string; lat: number; lng: number }

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

/**
 * Ubica al jugador DE VERDAD: pide la posición y le pregunta a `/api/public/geo/reverse` en qué
 * localidad está (`precision=locality`: nunca se pide una dirección exacta; las coordenadas van redondeadas). La localidad se guarda en
 * el dispositivo (`useSavedZona`, coordenadas a ~1 km) para no volver a preguntar.
 *
 * NUNCA pide la ubicación sola: eso mostraba el cartel del navegador en cada visita.
 * `locate()` la pide a pedido (botón "Usar mi ubicación actual"). La única excepción es que el
 * permiso YA esté concedido: ahí consultarla no muestra ningún cartel.
 * Los estados de fallo (denied/unsupported/error/…) son informativos, nunca bloqueantes.
 */
export function useNearestCity(): {
  state: NearestCityState
  locate: () => void
  /** Descarta la consulta en vuelo: el resultado que llegue después no se guarda ni se muestra. */
  cancel: () => void
} {
  const supported = useClientValue(readGeolocationSupported, true)
  const [zona, saveZona] = useSavedZona()
  const hasZona = Boolean(zona?.city)
  const place = useCurrentPlace('locality')
  const { locate: locatePlace, reset: cancel } = place
  // El navegador ya tenía el permiso bloqueado (se sabe sin pedir nada).
  const [blocked, setBlocked] = useState(false)

  const locate = useCallback(() => {
    locatePlace((found) =>
      saveZona({
        city: found.city,
        province: found.province,
        lat: roundCoord(found.lat),
        lng: roundCoord(found.lng),
      }),
    )
  }, [locatePlace, saveZona])

  useEffect(() => {
    if (!supported || hasZona) return

    let cancelled = false
    void readGeolocationPermission().then((permission) => {
      if (cancelled) return
      if (permission === 'denied') setBlocked(true)
      else if (permission === 'granted') locate()
    })

    return () => {
      cancelled = true
    }
  }, [supported, hasZona, locate])

  const s = place.state
  let state: NearestCityState =
    s.status === 'found'
      ? {
          status: 'found',
          city: s.place.city,
          province: s.place.province,
          lat: roundCoord(s.place.lat),
          lng: roundCoord(s.place.lng),
        }
      : s
  if (state.status === 'idle' && blocked) state = { status: 'denied' }
  return { state: supported ? state : UNSUPPORTED, locate, cancel }
}

const UNSUPPORTED: NearestCityState = { status: 'unsupported' }
