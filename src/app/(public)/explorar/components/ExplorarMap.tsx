'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { formatArs } from '@/lib/format'
import RatingStars from '@/components/public/RatingStars'

type Located = PublicTenantCard & { latitude: number; longitude: number }

function isLocated(t: PublicTenantCard): t is Located {
  return typeof t.latitude === 'number' && typeof t.longitude === 'number'
}

// Pin estilo Airbnb: pastilla con el precio "Desde". Usa divIcon para evitar
// el bug de los íconos por defecto de Leaflet con bundlers.
// active=true → color más oscuro + leve escala para resaltar en split view.
function priceIcon(t: Located, active = false): L.DivIcon {
  const label = t.fromPriceCents != null ? formatArs(t.fromPriceCents) : t.name.slice(0, 2).toUpperCase()
  // Texto blanco bold de 12px: eso es "texto normal" para WCAG (12px no califica como
  // grande ni en bold), así que el fondo tiene que dar 4.5:1 contra #fff.
  //   #059669  emerald-600  3.76:1  ✗   <- era el pin por defecto, o sea CASI TODOS
  //   #047857  emerald-700  5.48:1  ✓
  //   #065f46  emerald-800  7.68:1  ✓
  // Los dos estados bajan un escalón: se conserva la jerarquía "active más oscuro" (ver
  // comentario de arriba) y ninguno de los dos queda abajo de AA.
  // El sweep de contraste previo no lo agarró porque estos colores viven en el html crudo
  // de un `L.divIcon`, no en clases de Tailwind — un grep no los ve.
  const bg = active ? '#065f46' : '#047857'
  const scale = active ? 'transform:translate(-50%,-100%) scale(1.12);' : 'transform:translate(-50%,-100%);'
  const html = `<div style="${scale}white-space:nowrap;background:${bg};color:#fff;font-weight:700;font-size:12px;line-height:1;padding:6px 10px;border-radius:9999px;box-shadow:0 2px 8px rgba(2,6,23,.35);border:2px solid #fff">${label}</div>`
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -28] })
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 14)
      return
    }
    map.fitBounds(points, { padding: [48, 48] })
  }, [map, points])
  return null
}

export default function ExplorarMap({
  results,
  activeId = null,
}: {
  results: PublicTenantCard[]
  activeId?: string | null
}) {
  const located = useMemo(() => results.filter(isLocated), [results])
  const points = useMemo<[number, number][]>(
    () => located.map((t) => [t.latitude, t.longitude]),
    [located],
  )

  if (located.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-muted-foreground">
        <MapPin className="h-10 w-10" aria-hidden />
        <p className="max-w-xs text-center text-sm">
          Los complejos de esta búsqueda todavía no tienen ubicación cargada en el mapa.
        </p>
      </div>
    )
  }

  // Centro inicial = primer punto (FitBounds ajusta el encuadre apenas monta).
  const center: [number, number] = points[0]

  return (
    // isolate: los panes internos de Leaflet usan z-index 400+; sin un stacking
    // context propio taparían cualquier dropdown de la página (p. ej. el combobox
    // de localidad, que el <select> nativo anterior no sufría por ser popup del OS).
    <div className="isolate h-[70vh] overflow-hidden rounded-2xl border border-border shadow-sm">
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {located.map((t) => (
          <Marker key={t.id} position={[t.latitude, t.longitude]} icon={priceIcon(t, t.id === activeId)}>
            <Popup>
              <div className="w-52">
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.address ? `${t.address} · ` : ''}
                  {t.city}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  {t.reviewCount > 0 ? (
                    <RatingStars rating={t.avgRating} count={t.reviewCount} className="text-muted-foreground" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin reseñas</span>
                  )}
                  {t.fromPriceCents != null && (
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {formatArs(t.fromPriceCents)}
                    </span>
                  )}
                </div>
                <Link
                  href={`/${t.slug}`}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Ver complejo
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
