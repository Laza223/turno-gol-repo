'use client'

import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L, { type Map as LeafletMap } from 'leaflet'

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="transform:translate(-50%,-100%);width:18px;height:18px;border-radius:9999px;background:#059669;border:3px solid #fff;box-shadow:0 2px 6px rgba(2,6,23,.4)"></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
})

/** Mini-mapa de ubicación para la pantalla de éxito de reserva. */
export default function BookingMiniMap({
  lat,
  lng,
  label,
}: {
  lat: number
  lng: number
  label: string
}) {
  const [map, setMap] = useState<LeafletMap | null>(null)

  // `MapContainer` solo reenvía className/id/style al div contenedor — el resto
  // de las props (incluido `aria-label`) se pasan como MapOptions de Leaflet,
  // que las ignora en silencio. Sin esto el contenedor queda focuseable
  // (Leaflet le pone tabindex=0 por navegación de teclado) pero sin nombre
  // accesible: foco fantasma para lectores de pantalla.
  useEffect(() => {
    map?.getContainer().setAttribute('aria-label', `Ubicación de ${label}`)
  }, [map, label])

  return (
    <MapContainer
      ref={setMap}
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      className="h-44 w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {/* keyboard={false}: sin esto Leaflet marca el pin con role="button" +
          tabindex=0 (navegación por teclado de un marker "clickeable") pero
          este pin no tiene onClick ni Popup — queda un botón fantasma sin
          nombre accesible (aria-command-name). Es puramente decorativo: el
          mapa ya lleva el aria-label con la ubicación. */}
      <Marker position={[lat, lng]} icon={pinIcon} keyboard={false} />
    </MapContainer>
  )
}
