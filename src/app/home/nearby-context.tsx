'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { AvailabilityResponse } from '@/modules/tenants/public.service'
import { useClientValue } from '@/hooks/use-client-value'
import { todayART } from '@/shared/time/art-date'
import { freeSlots, pickNearby, type FreeSlot } from './nearby'

/** Los que la búsqueda trae ordenados por distancia; alcanza para cualquier escalón de radio. */
const SEARCH_LIMIT = 30
/** Más lejos que esto, sugerir la localidad del complejo más cercano confundiría. */
const CITY_PREFILL_MAX_KM = 50
const MAIN_CARD_SLOTS = 4

export type NearbyComplex = PublicTenantCard & {
  distanceKm: number
  /** `undefined` mientras carga; `[]` si hoy no le quedan turnos libres. */
  slots?: FreeSlot[]
}

export type NearbyState =
  | { status: 'locating' }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'error' }
  | { status: 'none' }
  | {
      status: 'found'
      complexes: NearbyComplex[]
      inZone: number
      /** Redondeadas a ~1 km: alcanzan para "ver todas" y no viajan más precisas en la URL. */
      coords: { lat: number; lng: number }
    }

type NearbyContextValue = {
  state: NearbyState
  nearestCity: { city: string; province: string } | null
  locate: () => void
}

const NearbyContext = createContext<NearbyContextValue>({
  state: { status: 'locating' },
  nearestCity: null,
  locate: () => {},
})

export function useNearby(): NearbyContextValue {
  return useContext(NearbyContext)
}

const readGeolocationSupported = (): boolean =>
  typeof navigator === 'undefined' ? true : Boolean(navigator.geolocation)

async function loadSlots(slug: string, date: string, max: number): Promise<FreeSlot[]> {
  const res = await fetch(`/api/public/availability?${new URLSearchParams({ slug, date })}`)
  if (!res.ok) return []
  return freeSlots(slug, (await res.json()) as AvailabilityResponse, max)
}

/**
 * Una sola geolocalización para todo el hero: la tarjeta de la cancha más
 * cercana y la localidad sugerida del buscador leen de acá. Solo datos
 * propios (búsqueda por distancia + disponibilidad pública), sin geocoding
 * externo. Los estados de falla nunca bloquean: el buscador sigue andando.
 */
export function NearbyProvider({ children }: { children: ReactNode }) {
  const supported = useClientValue(readGeolocationSupported, true)
  const [state, setState] = useState<NearbyState>({ status: 'locating' })
  const [nearestCity, setNearestCity] = useState<NearbyContextValue['nearestCity']>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    const set = (next: NearbyState) => {
      if (!cancelled) setState(next)
    }

    async function lookup(lat: number, lng: number): Promise<void> {
      try {
        const params = new URLSearchParams({
          sort: 'distance',
          online: '1',
          lat: lat.toFixed(6),
          lng: lng.toFixed(6),
          limit: String(SEARCH_LIMIT),
        })
        const res = await fetch(`/api/public/search?${params}`)
        if (!res.ok) return set({ status: 'error' })
        const { results = [] } = (await res.json()) as { results?: PublicTenantCard[] }

        const closest = results[0]
        if (
          !cancelled &&
          closest?.distanceKm != null &&
          closest.distanceKm <= CITY_PREFILL_MAX_KM
        ) {
          setNearestCity({ city: closest.city, province: closest.province })
        }

        const { picked, inZone } = pickNearby(results)
        if (picked.length === 0) return set({ status: 'none' })
        const coords = { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }
        set({ status: 'found', complexes: picked, inZone, coords })

        const date = todayART()
        const slots = await Promise.all(
          picked.map((t, i) =>
            loadSlots(t.slug, date, i === 0 ? MAIN_CARD_SLOTS : 1).catch(() => []),
          ),
        )
        set({
          status: 'found',
          complexes: picked.map((t, i) => ({ ...t, slots: slots[i] })),
          inZone,
          coords,
        })
      } catch {
        set({ status: 'error' })
      }
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => void lookup(pos.coords.latitude, pos.coords.longitude),
      // code 1 = PERMISSION_DENIED; el resto (timeout, sin señal) es error genérico.
      (err) => set({ status: err.code === 1 ? 'denied' : 'error' }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    )
    return () => {
      cancelled = true
    }
  }, [supported, attempt])

  const locate = useCallback(() => {
    setState({ status: 'locating' })
    setAttempt((n) => n + 1)
  }, [])

  const value: NearbyContextValue = {
    state: supported ? state : { status: 'unsupported' },
    nearestCity,
    locate,
  }
  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>
}
