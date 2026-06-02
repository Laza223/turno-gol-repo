import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { formatFromPrice } from '@/lib/format'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import RatingStars from '@/components/public/RatingStars'

/**
 * Tarjeta de complejo destacado para la landing (tema oscuro).
 * Coherente con el lenguaje visual del hero/features. La versión clara
 * (TenantCard) vive en /explorar.
 */
export default function FeaturedComplexCard({ tenant }: { tenant: PublicTenantCard }) {
  const fromPrice = formatFromPrice(tenant.fromPriceCents)
  const amenities = activeAmenities(tenant.amenities).slice(0, 4)

  return (
    <Link
      href={`/${tenant.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-2xl hover:shadow-emerald-500/10 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-800">
        {tenant.coverUrl ? (
          <Image
            src={tenant.coverUrl}
            alt={`Cancha de ${tenant.name}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-900/40 to-slate-800 text-4xl font-bold text-emerald-300/40">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {/* Degradé para legibilidad de los overlays */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/30"
        />

        {tenant.reviewCount > 0 && (
          <div className="absolute left-3 top-3 inline-flex items-center rounded-full bg-slate-950/70 px-2 py-1 text-white backdrop-blur-sm">
            <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
          </div>
        )}

        {tenant.allowOnlineBooking && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Zap className="h-3 w-3" aria-hidden />
            Reserva online
          </span>
        )}

        {fromPrice && (
          <span className="absolute bottom-3 left-3 inline-flex items-baseline gap-1 rounded-lg bg-white/95 px-2.5 py-1 text-sm font-bold text-slate-900 shadow-sm tabular-nums">
            {fromPrice}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-base font-semibold text-white transition-colors group-hover:text-emerald-300">
          {tenant.name}
        </h3>
        <p className="flex items-center gap-1.5 text-sm text-slate-400">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {tenant.address ? `${tenant.address} · ` : ''}
            {tenant.city}
          </span>
        </p>

        {amenities.length > 0 && (
          <ul className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {amenities.map((key) => {
              const { label, Icon } = AMENITIES[key]
              return (
                <li
                  key={key}
                  title={label}
                  className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-1 text-[11px] text-slate-300 ring-1 ring-inset ring-white/10"
                >
                  <Icon className="h-3.5 w-3.5 text-emerald-300/80" aria-hidden />
                  <span className="sr-only sm:not-sr-only">{label}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Link>
  )
}
