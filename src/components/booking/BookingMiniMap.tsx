'use client'

import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'

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
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      className="h-44 w-full"
      aria-label={`Ubicación de ${label}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]} icon={pinIcon} />
    </MapContainer>
  )
}
