'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { Crosshair, MapPin, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GeocodeCandidate } from '@/modules/tenants/geocode.service'

// Leaflet toca window: solo en cliente. `dynamic` con ssr:false únicamente se
// puede declarar dentro de un Client Component — por eso este archivo existe
// separado del mapa, igual que `ExplorarMapLoader`.
const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => (
    // `role="status"` no es decorativo: un `aria-label` sobre un div SIN rol es
    // una violacion de axe (aria-prohibited-attr), y con el mapa detras de un
    // `next/dynamic` el esqueleto es un estado que la auditoria alcanza a medir
    // cuando el runner va lento. Ademas es el rol correcto para "cargando".
    <div
      role="status"
      className="h-64 w-full animate-pulse rounded-xl border border-border bg-muted"
      aria-busy="true"
      aria-label="Cargando mapa"
    />
  ),
})

/** 5 decimales ≈ 1 metro: más precisión que eso no la da ni el GPS del celular. */
function formatCoordinate(value: number): string {
  return value.toFixed(5)
}

/**
 * Firma de `geocodeAddressAction` (`settings/perfil/actions.ts`), tipada
 * localmente en vez de importada: este archivo es un Client Component y ese
 * módulo lleva `'use server'` — importar la FUNCIÓN de ahí arrastraría drizzle
 * y `node:async_hooks` al bundle del cliente y rompería Storybook. Sólo la
 * forma (este tipo) cruza la frontera; la implementación real la inyecta el
 * Server Component que renderiza a este componente, por prop.
 */
export type GeocodeAddressAction = (input: {
  address: string
  city?: string
  province?: string
}) => Promise<{ success: true; candidates: GeocodeCandidate[] } | { success: false; error: string }>

type SearchState = 'idle' | 'loading' | 'empty' | 'error'

export default function LocationPickerField({
  initialLatitude,
  initialLongitude,
  fallbackCenter,
  fallbackZoom,
  collapsible = false,
  defaultQuery = '',
  city,
  province,
  geocodeAction,
  onHasPointChange,
}: {
  initialLatitude: number | null
  initialLongitude: number | null
  fallbackCenter: [number, number]
  fallbackZoom: number
  /**
   * Esconde el mapa detrás de un disclosure, para el paso más angosto del
   * embudo (el wizard): la ubicación es opcional y no tiene que agregarle peso
   * visual al alta. NO se usa el `Collapsible` de `components/ui`: ese monta
   * con `forceMount` + `display:none`, y un mapa de Leaflet en un contenedor
   * sin dimensiones se renderiza roto al abrirse (haría falta
   * `invalidateSize`). Acá el mapa se desmonta de verdad; lo que tiene que
   * seguir en el DOM son los inputs ocultos, y esos quedan siempre afuera.
   */
  collapsible?: boolean
  /** Dirección ya tipeada en el form (ej. "Av. Corrientes 1234"), como punto de partida editable del buscador. */
  defaultQuery?: string
  /** Ciudad/provincia ya elegidas: acotan la búsqueda contra Georef. */
  city?: string
  province?: string
  /**
   * Sin esta prop el buscador no se muestra y el campo se comporta como antes
   * (sólo mapa manual) — es el caso de consumidores que todavía no la cablean.
   */
  geocodeAction?: GeocodeAddressAction
  /** Avisa si hay punto marcado, para que el form muestre la consecuencia (ej. el preview del wizard). */
  onHasPointChange?: (hasPoint: boolean) => void
}) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    initialLatitude !== null && initialLongitude !== null
      ? { lat: initialLatitude, lng: initialLongitude }
      : null,
  )
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  // En revisita, un punto ya cargado abre el disclosure solo: esconderle a
  // alguien el dato que ya cargó es peor que el ruido visual que ahorra.
  const [open, setOpen] = useState(!collapsible || initialLatitude !== null)

  const [query, setQuery] = useState(defaultQuery)
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([])
  // Objeto NUEVO en cada selección (aunque sea el mismo candidato dos veces):
  // `FlyToTarget` en LocationPicker.tsx dispara por identidad de referencia.
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(
    null,
  )

  const pick = useCallback(
    (lat: number, lng: number) => {
      setGeoError(null)
      setPoint({ lat, lng })
      onHasPointChange?.(true)
    },
    [onHasPointChange],
  )

  async function handleSearch() {
    if (!geocodeAction) return
    const address = query.trim()
    if (!address) return

    setSearchState('loading')
    setSearchError(null)
    setCandidates([])

    const result = await geocodeAction({ address, city, province })

    if (!result.success) {
      setSearchState('error')
      setSearchError(result.error)
      return
    }
    if (result.candidates.length === 0) {
      setSearchState('empty')
      return
    }
    setSearchState('idle')
    setCandidates(result.candidates)
  }

  // Elegir un candidato fija el punto (mismo `pick` que el click en el mapa o
  // "usar mi ubicación") y además mueve la vista ahí con zoom de calle: sin
  // esto el mapa se queda mostrando el centro de la provincia con el pin
  // recién puesto invisible fuera de cuadro.
  function selectCandidate(candidate: GeocodeCandidate) {
    pick(candidate.lat, candidate.lng)
    setFlyTarget({ lat: candidate.lat, lng: candidate.lng, zoom: 17 })
    setQuery(candidate.label)
    setCandidates([])
    setSearchState('idle')
    // Un resultado de búsqueda es la señal más fuerte de que el dueño quiere
    // ver el mapa: no tiene sentido esconder el punto que acaba de elegir.
    if (collapsible) setOpen(true)
  }

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // El input vive dentro del <form> del paso (StepIdentity): sin este
    // preventDefault, Enter dispara el submit del wizard en vez de buscar.
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSearch()
    }
  }

  // El dueño configurando desde el celular suele estar EN el complejo, así que
  // es la vía más precisa. Va como gesto explícito, nunca como prompt al
  // montar: pedir permiso de ubicación sin que nadie lo pida se deniega solo.
  function useCurrentPosition() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Tu navegador no permite compartir la ubicación. Marcá el punto en el mapa.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pick(pos.coords.latitude, pos.coords.longitude),
      () =>
        setGeoError(
          'No pudimos acceder a tu ubicación. Revisá el permiso del navegador o marcá el punto en el mapa.',
        ),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    )
  }

  // Centro actual del mapa. Es lo que hace que todo el flujo sea operable por
  // teclado: Leaflet ya permite mover el mapa con las flechas, y este botón
  // convierte ese movimiento en un punto sin depender del click.
  function pickMapCenter() {
    if (!map) return
    const { lat, lng } = map.getCenter()
    pick(lat, lng)
  }

  return (
    <div className="space-y-3">
      {/* Controlados por estado, no por defaultValue: así sobreviven al reset
          que React 19 le hace al form cuando la Server Action termina. Sin
          `required` — un input oculto queda fuera de la validación del browser
          y nunca bloquearía el submit; la validación real es server-side. */}
      <input type="hidden" name="latitude" value={point ? String(point.lat) : ''} />
      <input type="hidden" name="longitude" value={point ? String(point.lng) : ''} />

      {geocodeAction && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleQueryKeyDown}
              placeholder="Buscá tu dirección"
              aria-label="Buscar dirección"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSearch()}
              isLoading={searchState === 'loading'}
              disabled={query.trim().length === 0}
            >
              <Search className="mr-2 h-4 w-4" aria-hidden />
              Buscar
            </Button>
          </div>

          <div aria-live="polite">
            {searchState === 'empty' && (
              <p className="text-sm text-muted-foreground">
                No la encontramos. Marcá el punto en el mapa.
              </p>
            )}
            {searchState === 'error' && searchError && (
              <p role="alert" className="text-sm text-destructive">
                {searchError}
              </p>
            )}
          </div>

          {candidates.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {candidates.map((candidate) => (
                <li key={candidate.label}>
                  <button
                    type="button"
                    onClick={() => selectCandidate(candidate)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    {candidate.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Trigger con `Button variant="ghost"`, no un link verde: `text-emerald-700`
          daba 4.41:1 contra el gris del contenedor, abajo del 4.5 de AA (el OKLCH
          de Tailwind 4 corrió esos verdes). El ghost hereda `text-foreground`. */}
      {collapsible && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="location-picker-panel"
          className="-ml-2"
        >
          <MapPin className="mr-2 h-4 w-4" aria-hidden />
          {open ? 'Ocultar el mapa' : 'Marcarlo en el mapa (opcional)'}
        </Button>
      )}

      {open && (
        <div id="location-picker-panel" className="space-y-3">
          <LocationPicker
            latitude={point?.lat ?? null}
            longitude={point?.lng ?? null}
            fallbackCenter={fallbackCenter}
            fallbackZoom={fallbackZoom}
            flyTo={flyTarget}
            onPick={pick}
            onMapReady={setMap}
          />
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        {point ? (
          <span className="tabular-nums">
            Punto marcado en {formatCoordinate(point.lat)}, {formatCoordinate(point.lng)}
          </span>
        ) : (
          <span>Sin ubicación marcada. Tocá el mapa donde está tu complejo.</span>
        )}
      </p>

      {/* type="button" en los tres: sin eso, un botón adentro de un form lo
          envía. Es el clásico silencioso de este patrón. */}
      <div className={open ? 'flex flex-wrap gap-2' : 'hidden'}>
        <Button type="button" variant="outline" size="sm" onClick={useCurrentPosition}>
          <Crosshair className="mr-2 h-4 w-4" aria-hidden />
          Usar mi ubicación actual
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={pickMapCenter} disabled={!map}>
          <MapPin className="mr-2 h-4 w-4" aria-hidden />
          Poner el punto en el centro
        </Button>
        {point && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setPoint(null)
              onHasPointChange?.(false)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Quitar ubicación
          </Button>
        )}
      </div>

      {geoError && (
        <p className="text-sm text-destructive" role="status">
          {geoError}
        </p>
      )}
    </div>
  )
}
