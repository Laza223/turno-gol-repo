'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { formatFromPrice } from '@/lib/format'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import RatingStars from '@/components/public/RatingStars'

export default function FeaturedComplexCard({ tenant }: { tenant: PublicTenantCard }) {
  const fromPrice = formatFromPrice(tenant.fromPriceCents)
  const amenities = activeAmenities(tenant.amenities).slice(0, 4)
  const initials = tenant.name.slice(0, 2).toUpperCase()

  return (
    <Link
      href={`/${tenant.slug}`}
      className="group block overflow-hidden border border-white/[.09] transition-[transform,box-shadow,border-color] duration-[180ms] hover:-translate-y-[6px] hover:border-emerald-500/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]"
      style={{
        borderRadius: '20px',
        background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.82))',
        boxShadow: '0 24px 50px -34px rgba(0,0,0,.9)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow =
          '0 30px 60px -30px rgba(0,0,0,.95), 0 0 40px -6px rgba(16,185,129,.35)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 24px 50px -34px rgba(0,0,0,.9)'
      }}
    >
      {/* Cover */}
      <div
        className="relative h-[168px] overflow-hidden"
        style={{
          background:
            'radial-gradient(130% 130% at 78% 0%, rgba(16,185,129,.45), transparent 58%), linear-gradient(140deg, #065f46, #022c22)',
        }}
      >
        {/* Grid pattern */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        {/* Ghost initials */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[14px] left-5 font-display font-black italic leading-none text-white/[.14]"
          style={{ fontSize: '56px', letterSpacing: '-0.04em' }}
        >
          {initials}
        </span>

        {/* Cover photo when available */}
        {tenant.coverUrl && (
          <Image
            src={tenant.coverUrl}
            alt={`Cancha de ${tenant.name}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover opacity-80 transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        )}

        {/* "Reserva online" badge */}
        {tenant.allowOnlineBooking && (
          <div className="absolute left-[14px] top-[14px]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-500 px-[10px] py-[5px] text-xs font-semibold text-white shadow-lg">
              <Zap className="h-3 w-3" aria-hidden />
              Reserva online
            </span>
          </div>
        )}

        {/* Rating badge */}
        {tenant.reviewCount > 0 && (
          <div
            className="absolute right-[14px] top-[14px] inline-flex items-center gap-1 rounded-full px-[10px] py-[5px] backdrop-blur-sm"
            style={{
              background: 'rgba(2,6,23,.62)',
              border: '1px solid rgba(255,255,255,.14)',
            }}
          >
            <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-[18px_20px_20px]">
        <h3 className="font-display font-bold text-[18px] text-[#f8fafc]">{tenant.name}</h3>
        <div className="mt-[6px] flex items-center gap-[6px] text-[13px] text-slate-400">
          <MapPin className="h-[14px] w-[14px] shrink-0 text-emerald-500" aria-hidden />
          <span className="truncate">
            {tenant.address ? `${tenant.address} · ` : ''}
            {tenant.city}
          </span>
        </div>

        {/* Amenity tags */}
        {amenities.length > 0 && (
          <div className="mt-[14px] flex flex-wrap gap-[7px]">
            {amenities.map((key) => (
              <span
                key={key}
                className="whitespace-nowrap rounded-[8px] border border-white/[.08] bg-white/[.05] px-[10px] py-[4px] text-xs font-semibold text-slate-300"
              >
                {AMENITIES[key].label}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-[18px] flex items-center justify-between gap-3 border-t border-white/[.08] pt-[16px]">
          <div>
            {fromPrice && (
              <>
                <span className="text-xs text-slate-500">Desde </span>
                <span className="font-display font-bold text-[17px] text-[#f8fafc]">
                  {fromPrice}
                </span>
              </>
            )}
          </div>
          <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-[13.5px] font-bold text-emerald-400">
            Ver turnos
            <ArrowRight className="h-[15px] w-[15px]" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}
