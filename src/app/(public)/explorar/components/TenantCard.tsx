import Link from 'next/link'
import { MapPin, Navigation, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { SlotPill } from '@/modules/tenants/availability-search.service'
import { formatFromPrice } from '@/lib/format'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import { formatLabel, surfaceLabel } from '@/components/public/courtFacets'
import RatingStars from '@/components/public/RatingStars'
import FavoriteButton from '@/components/public/FavoriteButton'
import TenantCardCarousel from './TenantCardCarousel'

/**
 * Tarjeta de complejo para /explorar (tema claro). Patrón stretched-link:
 * el <Link> del título cubre toda la card con ::after, así el botón de
 * favorito y el carrusel (hermanos con z) quedan fuera del <a> y el HTML
 * es válido. Los overlays de la imagen van en z-20, por encima del carrusel
 * (z-10) y del gradiente (z-10, pointer-events-none).
 */
export default function TenantCard({
  tenant,
  initialFavorited = false,
  photos = [],
  slotPills,
}: {
  tenant: PublicTenantCard
  initialFavorited?: boolean
  /** Fotos de canchas del complejo (además del cover), para el carrusel. */
  photos?: string[]
  /** Turnos libres del día buscado (solo cuando hay búsqueda con fecha+hora). */
  slotPills?: { date: string; slots: SlotPill[] }
}) {
  const fromPrice = formatFromPrice(tenant.fromPriceCents)
  const amenities = activeAmenities(tenant.amenities).slice(0, 4)
  const formats = tenant.courtFormats.slice(0, 3)
  const surfaces = tenant.courtSurfaces.slice(0, 2)
  // Mismo criterio que la galería del perfil: cover primero, luego canchas, sin duplicados.
  const allPhotos = Array.from(
    new Set([tenant.coverUrl, ...photos].filter((p): p is string => Boolean(p))),
  )

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/10 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 motion-reduce:hover:translate-y-0">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
        {allPhotos.length > 0 ? (
          <TenantCardCarousel photos={allPhotos} name={tenant.name} href={`/${tenant.slug}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 text-3xl font-bold text-emerald-600/40">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent"
        />

        {tenant.allowOnlineBooking && (
          <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Zap className="h-3 w-3" aria-hidden />
            Reserva online
          </span>
        )}

        {/* Fuera del stretched-link (z-20) para que el HTML sea válido */}
        <FavoriteButton tenantId={tenant.id} initialFavorited={initialFavorited} className="absolute right-3 top-3 z-20" />

        {fromPrice && (
          <span className="absolute bottom-3 left-3 z-20 inline-flex items-baseline rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-slate-900 shadow-sm tabular-nums">
            {fromPrice}
          </span>
        )}

        {tenant.reviewCount > 0 && (
          <span className="absolute bottom-3 right-3 z-20 inline-flex items-center rounded-full bg-white/95 px-2 py-1 text-slate-900 shadow-sm">
            <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-base font-semibold text-slate-900 transition-colors group-hover:text-emerald-700">
          <Link
            href={`/${tenant.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {tenant.name}
          </Link>
        </h3>

        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{tenant.address}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Navigation className="h-3 w-3 shrink-0" aria-hidden />
          {tenant.city}, {tenant.province}
          {tenant.distanceKm != null && (
            <span className="tabular-nums">· a {tenant.distanceKm} km</span>
          )}
        </p>

        {/* Píldoras de turnos libres: link directo a la reserva con court+fecha+hora.
            z-10 sobre el stretched-link, como el botón de favorito. */}
        {tenant.allowOnlineBooking && slotPills && slotPills.slots.length > 0 && (
          <div
            role="group"
            aria-label={`Turnos libres el ${slotPills.date.split('-').reverse().join('/')}`}
            className="relative z-10 flex flex-wrap gap-1.5 pt-0.5"
          >
            {slotPills.slots.map((s) => (
              <Link
                key={s.time}
                href={`/${tenant.slug}/reservar?court=${s.courtId}&date=${slotPills.date}&time=${s.time}&dur=${s.durationMins}`}
                aria-label={`Reservar a las ${s.time}`}
                className="inline-flex items-center rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 tabular-nums"
              >
                {s.time}
              </Link>
            ))}
          </div>
        )}

        {(formats.length > 0 || surfaces.length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {formats.map((f) => (
              <span
                key={`f-${f}`}
                className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
              >
                {formatLabel(f)}
              </span>
            ))}
            {surfaces.map((s) => (
              <span
                key={`s-${s}`}
                className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/15"
              >
                {surfaceLabel(s)}
              </span>
            ))}
          </div>
        )}

        {amenities.length > 0 && (
          <ul className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-slate-400">
            {amenities.map((key) => {
              const { label, Icon } = AMENITIES[key]
              return (
                <li key={key} title={label} className="inline-flex items-center">
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="sr-only">{label}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </article>
  )
}
