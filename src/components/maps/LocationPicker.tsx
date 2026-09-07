'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L, { type Map as LeafletMap } from 'leaflet'

// divIcon en vez del ícono por defecto: el de Leaflet rompe con bundlers
// (busca sus PNG por ruta relativa). Mismo criterio que `BookingMiniMap`.
// Verde 700 y no 600: es el mismo pin que ya usa el mapa de resultados.
const pinIcon = L.divIcon({
  className: '',
  html: `<div style="transform:translate(-50%,-100%);width:20px;height:20px;border-radius:9999px;background:#047857;border:3px solid #fff;box-shadow:0 2px 6px rgba(2,6,23,.4)"></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
})

/**
 * Recentra el mapa SOLO mientras no haya punto marcado.
 *
 * Las props de `MapContainer` son de inicialización: cambiar `center` después
 * de montar no hace nada. Hace falta un hijo con `useMap()`, igual que
 * `FitBounds` en `ExplorarMap`. Y la guarda del punto no es opcional: sin ella,
 * cambiar la provincia le arrancaría el mapa de abajo a alguien que ya marcó.
 */
function RecenterWhenEmpty({
  center,
  zoom,
  hasPoint,
}: {
  center: [number, number]
  zoom: number
  hasPoint: boolean
}) {
  const map = useMap()
  useEffect(() => {
    if (hasPoint) return
    map.setView(center, zoom)
  }, [map, center, zoom, hasPoint])
  return null
}

/** Coloca el punto donde el usuario hace click sobre el mapa. */
function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function LocationPicker({
  latitude,
  longitude,
  fallbackCenter,
  fallbackZoom,
  onPick,
  onMapReady,
}: {
  latitude: number | null
  longitude: number | null
  fallbackCenter: [number, number]
  fallbackZoom: number
  onPick: (lat: number, lng: number) => void
  /** Expone el mapa al padre para el botón "Poner el punto acá" (centro actual). */
  onMapReady?: (map: LeafletMap | null) => void
}) {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const hasPoint = latitude !== null && longitude !== null

  useEffect(() => {
    onMapReady?.(map)
  }, [map, onMapReady])

  // `MapContainer` solo reenvía className/id/style al div: el resto de las
  // props viajan como MapOptions de Leaflet, que las ignora en silencio. Sin
  // esto el contenedor queda focuseable (Leaflet le pone tabindex=0) pero sin
  // nombre accesible. Mismo arreglo que en `BookingMiniMap`.
  useEffect(() => {
    map
      ?.getContainer()
      .setAttribute(
        'aria-label',
        'Mapa para marcar la ubicación del complejo. Tocá para colocar el punto.',
      )
  }, [map])

  return (
    <MapContainer
      ref={setMap}
      center={hasPoint ? [latitude, longitude] : fallbackCenter}
      zoom={hasPoint ? 16 : fallbackZoom}
      scrollWheelZoom={false}
      className="h-64 w-full rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterWhenEmpty center={fallbackCenter} zoom={fallbackZoom} hasPoint={hasPoint} />
      <ClickToPlace onPick={onPick} />
      {hasPoint && (
        // Este pin SÍ es interactivo (se arrastra), así que a diferencia del de
        // `BookingMiniMap` no lleva `keyboard={false}` — pero por eso mismo
        // necesita nombre accesible, o queda un botón sin nombre para lectores.
        <Marker
          position={[latitude, longitude]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            // El `alt` del Marker sólo sirve con el ícono <img> por defecto:
            // con un `divIcon` no se aplica a ningún lado. Y como el marcador
            // es arrastrable, Leaflet le pone role="button" + tabindex=0 — sin
            // esto queda un botón sin nombre accesible (aria-command-name).
            add: (e) => {
              e.target
                .getElement()
                ?.setAttribute('aria-label', 'Ubicación del complejo. Arrastrá para ajustar.')
            },
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng()
              onPick(lat, lng)
            },
          }}
        />
      )}
    </MapContainer>
  )
}
