import Link from 'next/link'
import { MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { SlotPill } from '@/modules/tenants/availability-search.service'
import { formatArs } from '@/lib/format'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import { formatLabel, surfaceLabel } from '@/components/public/courtFacets'
import RatingStars from '@/components/public/RatingStars'
import FavoriteButton from '@/components/public/FavoriteButton'
import TenantCardCarousel from './TenantCardCarousel'

/**
 * Tarjeta de complejo para /explorar (tema "Matchday"). Patrón stretched-link:
 * el <Link> del título cubre toda la card con ::after; favorito y carrusel son
 * hermanos con z-index para que el HTML sea válido. Overlays sobre la foto:
 * SOLO badge online + favorito (precio y rating viven en el body).
 */
export default function TenantCard({
  tenant,
  initialFavorited = false,
  photos = [],
  slotPills,
  variant = 'grid',
}: {
  tenant: PublicTenantCard
  initialFavorited?: boolean
  photos?: string[]
  slotPills?: { date: string; slots: SlotPill[] }
  variant?: 'grid' | 'compact'
}) {
  if (variant === 'compact') return <TenantCardCompact tenant={tenant} initialFavorited={initialFavorited} />

  const fromPrice = tenant.fromPriceCents != null ? formatArs(tenant.fromPriceCents) : null
  const amenities = activeAmenities(tenant.amenities).slice(0, 4)
  const formats = tenant.courtFormats.slice(0, 3)
  const surfaces = tenant.courtSurfaces.slice(0, 1)
  const allPhotos = Array.from(
    new Set([tenant.coverUrl, ...photos].filter((p): p is string => Boolean(p))),
  )

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 border-t-2 border-t-emerald-500 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/10 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 motion-reduce:hover:translate-y-0">
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
          className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent"
        />
        {tenant.allowOnlineBooking && (
          <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Zap className="h-3 w-3" aria-hidden />
            Reservá online
          </span>
        )}
        <FavoriteButton tenantId={tenant.id} initialFavorited={initialFavorited} className="absolute right-3 top-3 z-20" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 transition-colors group-hover:text-emerald-700">
            <Link href={`/${tenant.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {tenant.name}
            </Link>
          </h3>
          {tenant.reviewCount > 0 && (
            <span className="shrink-0 pt-0.5">
              <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
            </span>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {tenant.city}, {tenant.province}
            {tenant.distanceKm != null && (
              <span className="tabular-nums"> · a {tenant.distanceKm} km</span>
            )}
          </span>
        </p>

        {(formats.length > 0 || surfaces.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {formats.map((f) => (
              <span
                key={`f-${f}`}
                className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
              >
                {formatLabel(f)}
              </span>
            ))}
            {surfaces.map((s) => (
              <span key={`s-${s}`} className="text-xs text-slate-500">
                · {surfaceLabel(s)}
              </span>
            ))}
          </div>
        )}

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

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {amenities.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-2 text-slate-400">
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
          ) : (
            <span />
          )}
          {fromPrice && (
            <p className="flex items-baseline gap-1 text-right">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">desde</span>
              <span className="font-display text-xl font-bold text-emerald-700 tabular-nums">
                {fromPrice}
              </span>
              <span className="text-xs text-slate-400">/turno</span>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/** Placeholder hasta Task 3.1 (variante mapa). Evita romper tipos/imports. */
function TenantCardCompact(_props: { tenant: PublicTenantCard; initialFavorited?: boolean }) {
  return null
}
