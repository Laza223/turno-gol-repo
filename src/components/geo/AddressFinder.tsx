'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, type KeyboardEvent } from 'react'
import { LocateFixed, MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  GeoAddress,
  GeoAddressesResponse,
  GeoLocality,
  GeoReverse,
  PickedAddress,
} from '@/modules/geo/geo.types'
import { resolveMapCenter } from '@/shared/geo/argentina'
import LocalityPicker from './LocalityPicker'
import { CURRENT_PLACE_MESSAGES, useCurrentPlace } from './use-current-place'

// Leaflet toca window: solo en cliente (mismo patrón que `LocationPickerField`).
const LocationPicker = dynamic(() => import('@/components/maps/LocationPicker'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="h-64 w-full animate-pulse rounded-xl border border-border bg-muted"
      aria-busy="true"
      aria-label="Cargando mapa"
    />
  ),
})

type FieldNames = {
  address: string
  city: string
  province: string
  latitude: string
  longitude: string
}

const DEFAULT_NAMES: FieldNames = {
  address: 'address',
  city: 'city',
  province: 'province',
  latitude: 'latitude',
  longitude: 'longitude',
}

type SearchState = 'idle' | 'loading' | 'done' | 'degraded' | 'error'

type Props = {
  idPrefix: string
  /** Valor inicial (revisita): si está completo, arranca en la tarjeta resumen. */
  value?: PickedAddress | null
  /** `null` mientras la dirección esté incompleta. */
  onChange?: (value: PickedAddress | null) => void
  /** Para usarlo dentro de un `<form>`: `true` = nombres por defecto, o los nombres a usar. */
  names?: boolean | FieldNames
  /** Muestra "Marcarlo en el mapa" (default false: el mapa es opcional). */
  showMap?: boolean
  inputClassName?: string
  className?: string
}

function isComplete(v: PickedAddress | null | undefined): v is PickedAddress {
  return Boolean(v?.address.trim() && v.city.trim() && v.province.trim())
}

function isAddressesResponse(body: unknown): body is GeoAddressesResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'results' in body &&
    Array.isArray((body as { results: unknown }).results)
  )
}

function toLocality(place: GeoReverse): GeoLocality {
  return {
    city: place.city,
    province: place.province,
    department: place.department,
    lat: place.lat,
    lng: place.lng,
    source: 'dataset',
  }
}

/**
 * Dirección del complejo, de arriba hacia abajo: "usar mi ubicación", localidad,
 * calle y altura. Nunca bloquea: si la calle no aparece, se usa tal cual.
 */
export default function AddressFinder({
  idPrefix,
  value = null,
  onChange,
  names,
  showMap = false,
  inputClassName,
  className,
}: Props) {
  const [picked, setPicked] = useState<PickedAddress | null>(isComplete(value) ? value : null)
  // En la revisita el punto guardado es el de la calle, no el de la localidad: sembrarlo
  // acá haría que otra calle "tal cual" heredara el pin viejo.
  const [locality, setLocality] = useState<GeoLocality | null>(
    value?.city && value.province
      ? { city: value.city, province: value.province, lat: null, lng: null, source: 'manual' }
      : null,
  )
  const [street, setStreet] = useState(value?.address ?? '')
  // Punto del GPS: si hay, "tal cual" lo usa en vez del centro de la localidad.
  const [gpsPoint, setGpsPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [confirmStreet, setConfirmStreet] = useState(false)
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [candidates, setCandidates] = useState<GeoAddress[]>([])
  const [searched, setSearched] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const searchController = useRef<AbortController | null>(null)
  const place = useCurrentPlace('address')

  const streetId = `${idPrefix}-street`
  const fieldNames = names ? (names === true ? DEFAULT_NAMES : names) : null

  function commit(next: PickedAddress | null) {
    setPicked(next)
    onChange?.(next)
  }

  function resetSearch() {
    searchController.current?.abort()
    setSearchState('idle')
    setCandidates([])
  }

  function useMyLocation() {
    place.locate((found: GeoReverse) => {
      resetSearch()
      setLocality(toLocality(found))
      setGpsPoint({ lat: found.lat, lng: found.lng })
      const address = found.address?.trim() ?? ''
      setStreet(address)
      // Sin altura (o sin calle) no se da por buena: se pide revisar.
      if (address && /\d/.test(address)) {
        setConfirmStreet(false)
        commit({
          address,
          city: found.city,
          province: found.province,
          latitude: found.lat,
          longitude: found.lng,
        })
      } else {
        setConfirmStreet(true)
        commit(null)
      }
    })
  }

  async function search() {
    const text = street.trim()
    if (!text || !locality) return
    searchController.current?.abort()
    const controller = new AbortController()
    searchController.current = controller
    setSearched(text)
    setCandidates([])
    setSearchState('loading')
    const params = new URLSearchParams({
      street: text,
      city: locality.city,
      province: locality.province,
    })
    if (locality.department) params.set('department', locality.department)
    try {
      const res = await fetch(`/api/public/geo/direcciones?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!res.ok) return setSearchState('error')
      const body: unknown = await res.json()
      if (!isAddressesResponse(body)) return setSearchState('error')
      setCandidates(body.results)
      setSearchState(body.degraded ? 'degraded' : 'done')
    } catch {
      if (!controller.signal.aborted) setSearchState('error')
    }
  }

  function chooseCandidate(c: GeoAddress) {
    resetSearch()
    setStreet(c.address)
    setConfirmStreet(false)
    commit({
      address: c.address,
      city: c.city,
      province: c.province,
      latitude: c.lat,
      longitude: c.lng,
    })
  }

  function useAsTyped() {
    if (!locality) return
    resetSearch()
    setConfirmStreet(false)
    commit({
      address: searched,
      city: locality.city,
      province: locality.province,
      latitude: gpsPoint?.lat ?? locality.lat,
      longitude: gpsPoint?.lng ?? locality.lng,
    })
  }

  function onStreetKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Dentro de un <form>, Enter busca; no envía.
    if (e.key === 'Enter') {
      e.preventDefault()
      void search()
    }
  }

  const failure =
    place.state.status !== 'idle' &&
    place.state.status !== 'locating' &&
    place.state.status !== 'found'
      ? CURRENT_PLACE_MESSAGES[place.state.status]
      : null

  const mapCenter = picked
    ? picked.latitude !== null && picked.longitude !== null
      ? resolveMapCenter(picked.province, picked.latitude, picked.longitude)
      : locality?.lat != null && locality.lng != null
        ? { center: [locality.lat, locality.lng] as [number, number], zoom: 13 }
        : resolveMapCenter(picked.province, null, null)
    : null

  return (
    <div className={cn('space-y-4', className)}>
      {fieldNames && (
        <>
          <input type="hidden" name={fieldNames.address} value={picked?.address ?? ''} />
          <input type="hidden" name={fieldNames.city} value={picked?.city ?? ''} />
          <input type="hidden" name={fieldNames.province} value={picked?.province ?? ''} />
          <input type="hidden" name={fieldNames.latitude} value={picked?.latitude ?? ''} />
          <input type="hidden" name={fieldNames.longitude} value={picked?.longitude ?? ''} />
        </>
      )}

      {picked ? (
        <div className="flex items-start gap-3 rounded-xl border border-border p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-foreground">{picked.address}</p>
            <p className="text-sm text-muted-foreground">
              {picked.city}, {picked.province}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 shrink-0"
            onClick={() => {
              setStreet(picked.address)
              commit(null)
            }}
          >
            Cambiar
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base"
              onClick={useMyLocation}
              isLoading={place.state.status === 'locating'}
            >
              <LocateFixed className="mr-2 h-5 w-5" aria-hidden />
              Usar mi ubicación actual
            </Button>
            <div aria-live="polite" className="text-sm text-muted-foreground">
              {failure && <p>{failure}</p>}
            </div>
          </div>

          <LocalityPicker
            id={`${idPrefix}-locality`}
            label="Localidad"
            value={locality}
            locate={false}
            inputClassName={inputClassName}
            onChange={(l) => {
              setLocality(l)
              setGpsPoint(null)
              resetSearch()
            }}
          />

          <div className="space-y-2">
            <label htmlFor={streetId} className="block text-sm font-medium text-foreground">
              Calle y altura
            </label>
            {confirmStreet && (
              <p className="text-sm text-muted-foreground">Revisá la calle y la altura.</p>
            )}
            <div className="flex gap-2">
              <Input
                id={streetId}
                value={street}
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Ej.: Av. Corrientes 1234"
                className={cn('h-11 flex-1 text-base md:text-sm', inputClassName)}
                onChange={(e) => {
                  setStreet(e.target.value)
                  resetSearch()
                }}
                onKeyDown={onStreetKeyDown}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => void search()}
                isLoading={searchState === 'loading'}
                disabled={!locality || street.trim().length === 0}
              >
                <Search className="mr-2 h-4 w-4" aria-hidden />
                Buscar
              </Button>
            </div>
            {!locality && (
              <p className="text-sm text-muted-foreground">Primero elegí la localidad.</p>
            )}

            <div aria-live="polite" className="text-sm text-muted-foreground">
              {searchState === 'done' && candidates.length === 0 && (
                <p>No encontramos esa dirección.</p>
              )}
              {(searchState === 'degraded' || searchState === 'error') && (
                <p>No pudimos buscar ahora. Podés usarla tal cual.</p>
              )}
            </div>

            {(searchState === 'done' || searchState === 'degraded' || searchState === 'error') && (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {candidates.map((c) => (
                  <li key={c.label}>
                    <button
                      type="button"
                      onClick={() => chooseCandidate(c)}
                      className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-base text-foreground hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      {c.label}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={useAsTyped}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-base text-foreground hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                  >
                    Usar «{searched}» tal cual
                  </button>
                </li>
              </ul>
            )}
          </div>
        </>
      )}

      {showMap && picked && mapCenter && (
        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 min-h-11"
            aria-expanded={mapOpen}
            aria-controls={`${idPrefix}-map`}
            onClick={() => setMapOpen((o) => !o)}
          >
            <MapPin className="mr-2 h-4 w-4" aria-hidden />
            {mapOpen ? 'Ocultar el mapa' : 'Marcarlo en el mapa'}
          </Button>
          {mapOpen && (
            <div id={`${idPrefix}-map`}>
              <LocationPicker
                latitude={picked.latitude}
                longitude={picked.longitude}
                fallbackCenter={mapCenter.center}
                fallbackZoom={mapCenter.zoom}
                onPick={(lat, lng) => commit({ ...picked, latitude: lat, longitude: lng })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
