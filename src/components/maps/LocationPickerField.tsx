'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { Crosshair, MapPin, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

export default function LocationPickerField({
  initialLatitude,
  initialLongitude,
  fallbackCenter,
  fallbackZoom,
  collapsible = false,
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

  const pick = useCallback((lat: number, lng: number) => {
    setGeoError(null)
    setPoint({ lat, lng })
  }, [])

  // Centro actual del mapa. Es lo que hace que todo el flujo sea operable por
  // teclado: Leaflet ya permite mover el mapa con las flechas, y este botón
  // convierte ese movimiento en un punto sin depender del click.
  function pickMapCenter() {
    if (!map) return
    const { lat, lng } = map.getCenter()
    pick(lat, lng)
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

  return (
    <div className="space-y-3">
      {/* Controlados por estado, no por defaultValue: así sobreviven al reset
          que React 19 le hace al form cuando la Server Action termina. Sin
          `required` — un input oculto queda fuera de la validación del browser
          y nunca bloquearía el submit; la validación real es server-side. */}
      <input type="hidden" name="latitude" value={point ? String(point.lat) : ''} />
      <input type="hidden" name="longitude" value={point ? String(point.lng) : ''} />

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
          <Button type="button" variant="ghost" size="sm" onClick={() => setPoint(null)}>
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
