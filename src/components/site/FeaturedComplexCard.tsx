import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { formatFromPrice } from '@/lib/format'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import RatingStars from '@/components/public/RatingStars'

/**
 * Card de complejo destacado de la landing. Theme-adaptive vía recetas
 * (`card-premium` + `mockup-cover`): light = elevación, dark = glass+glow.
 * El lift/glow de hover lo da CSS (`card-premium-interactive`) — sin JS.
 */
export default function FeaturedComplexCard({ tenant }: { tenant: PublicTenantCard }) {
  const fromPrice = formatFromPrice(tenant.fromPriceCents)
  const amenities = activeAmenities(tenant.amenities).slice(0, 4)
  const initials = tenant.name.slice(0, 2).toUpperCase()

  return (
    <Link
      href={`/${tenant.slug}`}
      className="card-premium card-premium-interactive group block cursor-pointer overflow-hidden rounded-[20px] transition-transform active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/* Cover */}
      <div className="mockup-cover relative h-[168px] overflow-hidden">
        {/* Retícula decorativa */}
        <div aria-hidden className="player-hero-grid absolute inset-0 bg-size-[28px_28px]" />
        {/* Iniciales fantasma */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[14px] left-5 font-display font-black italic leading-none text-emerald-950/12 dark:text-white/[.14]"
          style={{ fontSize: '56px', letterSpacing: '-0.04em' }}
        >
          {initials}
        </span>

        {/* Foto de portada si existe */}
        {tenant.coverUrl && (
          <Image
            src={tenant.coverUrl}
            alt={`Cancha de ${tenant.name}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100 dark:opacity-80"
          />
        )}

        {/* Badge "Reserva online" */}
        {tenant.allowOnlineBooking && (
          <div className="absolute left-[14px] top-[14px]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-[10px] py-[5px] text-xs font-semibold text-primary-foreground shadow-lg">
              <Zap className="h-3 w-3" aria-hidden />
              Reserva online
            </span>
          </div>
        )}

        {/* Badge de rating */}
        {tenant.reviewCount > 0 && (
          <div className="absolute right-[14px] top-[14px] inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-[10px] py-[5px] backdrop-blur-xs dark:border-white/[.14] dark:bg-slate-950/62">
            <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
          </div>
        )}
      </div>

      {/* Cuerpo */}
      <div className="p-[18px_20px_20px]">
        <h3 className="font-display text-[18px] font-bold text-foreground">{tenant.name}</h3>
        <div className="mt-[6px] flex items-center gap-[6px] text-[13px] text-muted-foreground">
          <MapPin className="h-[14px] w-[14px] shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
          <span className="truncate">
            {tenant.address ? `${tenant.address} · ` : ''}
            {tenant.city}
          </span>
        </div>

        {/* Chips de servicios */}
        {amenities.length > 0 && (
          <div className="mt-[14px] flex flex-wrap gap-[7px]">
            {amenities.map((key) => (
              <span
                key={key}
                className="whitespace-nowrap rounded-lg border border-border bg-muted/60 px-[10px] py-[4px] text-xs font-semibold text-muted-foreground dark:border-white/8 dark:bg-white/5 dark:text-slate-300"
              >
                {AMENITIES[key].label}
              </span>
            ))}
          </div>
        )}

        {/* Pie */}
        <div className="mt-[18px] flex items-center justify-between gap-3 border-t border-border pt-4 dark:border-white/8">
          <div>
            {fromPrice && (
              <>
                <span className="text-xs text-muted-foreground">Desde </span>
                <span className="font-display text-[17px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fromPrice}
                </span>
              </>
            )}
          </div>
          <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-[13.5px] font-bold text-emerald-700 dark:text-emerald-400">
            Ver turnos
            <ArrowRight className="h-[15px] w-[15px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}
