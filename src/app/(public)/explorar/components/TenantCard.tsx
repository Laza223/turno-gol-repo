import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { SlotPill } from '@/modules/tenants/availability-search.service'
import { formatArs, formatPerPlayer } from '@/lib/format'
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
  const perPlayer = formatPerPlayer(tenant.fromPriceCents, tenant.courtFormats)
  const amenities = activeAmenities(tenant.amenities).slice(0, 4)
  const formats = tenant.courtFormats.slice(0, 3)
  const surfaces = tenant.courtSurfaces.slice(0, 1)
  const allPhotos = Array.from(
    new Set([tenant.coverUrl, ...photos].filter((p): p is string => Boolean(p))),
  )

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border border-t-2 border-t-emerald-500 bg-card shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/10 active:scale-[0.99] focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:hover:shadow-emerald-500/15">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {allPhotos.length > 0 ? (
          <TenantCardCarousel photos={allPhotos} name={tenant.name} href={`/${tenant.slug}`} />
        ) : (
          <div
            className="relative flex h-full w-full items-center justify-center overflow-hidden"
            style={{
              background:
                'radial-gradient(130% 130% at 78% 0%, rgba(16,185,129,.45), transparent 58%), linear-gradient(140deg, #065f46, #022c22)',
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
            <span className="font-display text-5xl font-black italic tracking-tight text-white/16">
              {tenant.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 bg-linear-to-t from-slate-950/35 via-transparent to-transparent"
        />
        {tenant.allowOnlineBooking && (
          <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-md shadow-emerald-900/30">
            <Zap className="h-3 w-3" aria-hidden />
            Reservá online
          </span>
        )}
        <FavoriteButton tenantId={tenant.id} initialFavorited={initialFavorited} className="absolute right-3 top-3 z-20" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
            <Link href={`/${tenant.slug}`} className="after:absolute after:inset-0 focus-visible:outline-hidden">
              {tenant.name}
            </Link>
          </h3>
          {tenant.reviewCount > 0 && (
            <span className="shrink-0 pt-0.5">
              <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
            </span>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
                className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
              >
                {formatLabel(f)}
              </span>
            ))}
            {surfaces.map((s) => (
              <span key={`s-${s}`} className="text-xs text-muted-foreground">
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
                className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-semibold tabular-nums text-primary-foreground shadow-xs transition-[background-color,scale] hover:bg-primary/90 active:scale-95 motion-reduce:active:scale-100"
              >
                {s.time}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {amenities.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-2 text-muted-foreground">
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
            <div className="text-right">
              <p className="flex items-baseline justify-end gap-1">
                <span className="font-logo text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">desde</span>
                <span className="font-display text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {fromPrice}
                </span>
                <span className="text-xs text-muted-foreground">/turno</span>
              </p>
              {perPlayer && (
                <p className="text-[11px] tabular-nums text-muted-foreground">{perPlayer}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function TenantCardCompact({
  tenant,
  initialFavorited = false,
}: {
  tenant: PublicTenantCard
  initialFavorited?: boolean
}) {
  const fromPrice = tenant.fromPriceCents != null ? formatArs(tenant.fromPriceCents) : null
  return (
    <article className="group relative flex gap-3 rounded-xl border border-border bg-card p-2.5 shadow-xs transition-colors hover:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-500">
      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
        {tenant.coverUrl ? (
          <Image src={tenant.coverUrl} alt={`Cancha de ${tenant.name}`} fill sizes="112px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-emerald-50 to-muted text-lg font-bold text-emerald-600/40 dark:from-emerald-500/10 dark:text-emerald-300">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            <Link href={`/${tenant.slug}`} className="after:absolute after:inset-0">
              {tenant.name}
            </Link>
          </h3>
          {tenant.reviewCount > 0 && (
            <span className="shrink-0">
              <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{tenant.city}, {tenant.province}</p>
        {fromPrice && (
          <p className="mt-auto flex items-baseline gap-1">
            <span className="font-display text-base font-bold text-emerald-700 tabular-nums dark:text-emerald-400">{fromPrice}</span>
            <span className="text-xs text-muted-foreground">/turno</span>
          </p>
        )}
      </div>
      <FavoriteButton tenantId={tenant.id} initialFavorited={initialFavorited} className="absolute right-2 top-2 z-20" />
    </article>
  )
}
