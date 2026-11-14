import { ViewTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { TodayFreeSlots } from '@/modules/tenants/availability-search.service'
import { formatArs } from '@/lib/format'
import { formatsLabel } from '@/lib/formats-label'
import { buildFichaHref, buildReservarHref } from '@/lib/booking/reserve-url'
import FavoriteButton from '@/components/public/FavoriteButton'
import { cn } from '@/lib/utils'

/** La distancia como se lee en la tarjeta: "a 1,2 km". */
function distanceLabel(km: number): string {
  return `a ${km.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`
}

/**
 * Tarjeta de complejo de /explorar en vidrio pintado (portal de vidrio, F3: `.xcard` de
 * `buscador.html`). Patrón stretched-link: el link del nombre cubre la tarjeta con `::after`; el
 * favorito y los horarios van arriba con z-index para que el HTML sea válido.
 *
 * `today`: los horarios libres de hoy (`findTodayFreeSlotsByTenant`). `null` = hoy no le quedan;
 * sin el dato (la lectura falló) la tarjeta no dice nada de hoy. Un complejo sin reserva online no
 * muestra horarios.
 */
export default function TenantCard({
  tenant,
  initialFavorited = false,
  today,
  photo = tenant.coverUrl,
  index = 0,
  variant = 'grid',
}: {
  tenant: PublicTenantCard
  initialFavorited?: boolean
  today?: TodayFreeSlots | null
  /** La portada o, sin portada, la primera foto de una cancha. */
  photo?: string | null
  /** El orden en la grilla, para la entrada escalonada (tope de 8). */
  index?: number
  variant?: 'grid' | 'compact'
}) {
  const fichaHref = buildFichaHref(tenant.slug, {})
  const meta = [
    tenant.distanceKm != null ? distanceLabel(tenant.distanceKm) : null,
    formatsLabel(tenant.courtFormats),
  ]
    .filter(Boolean)
    .join(' · ')
  const price = tenant.fromPriceCents != null ? formatArs(tenant.fromPriceCents) : null
  const compact = variant === 'compact'

  return (
    <article
      className={cn(
        'ex-card glass-painted group relative flex min-w-0 overflow-hidden rounded-3xl text-portal-ink has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-portal-green',
        compact ? 'flex-row gap-3 p-2.5' : 'flex-col',
      )}
      style={{ '--i': Math.min(index, 8) } as CSSProperties}
    >
      <div
        className={cn(
          'relative shrink-0 overflow-hidden bg-portal-inner',
          compact ? 'h-20 w-28 rounded-2xl' : 'aspect-4/3 w-full',
        )}
      >
        {/* La foto lleva su nombre de transición: F9 la conecta con la portada de la ficha. */}
        <ViewTransition name={`complejo-foto-${tenant.slug}`} share="complejo-foto" default="none">
          {photo ? (
            <Image
              src={photo}
              alt={`Cancha de ${tenant.name}`}
              fill
              sizes={
                compact
                  ? '112px'
                  : '(width >= 1200px) 300px, (width >= 768px) 33vw, (width >= 640px) 290px, 50vw'
              }
              className="ex-card__img object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex size-full items-center justify-center bg-linear-to-br from-portal-slot to-portal-inner text-3xl font-bold tracking-tight text-portal-slot-ink"
            >
              {tenant.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </ViewTransition>
        {!compact && (
          <FavoriteButton
            tenantId={tenant.id}
            initialFavorited={initialFavorited}
            className="absolute top-2 right-2 z-20 md:size-11"
          />
        )}
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-[3px]',
          compact ? 'justify-center pr-12' : 'px-3 pt-3 pb-3.5 md:px-3.5 md:pt-3.5 md:pb-4',
        )}
      >
        <h3 className="text-base leading-5 font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
          <Link
            href={fichaHref}
            className="after:absolute after:inset-0 after:z-10 focus-visible:outline-hidden"
          >
            {tenant.name}
          </Link>
        </h3>
        {meta && <p className="truncate text-[13px] leading-[18px] text-portal-soft">{meta}</p>}
        <p className="text-[13px] leading-[18px] text-portal-soft tabular-nums">
          {price ? (
            <>
              desde <b className="font-semibold text-portal-ink">{price}</b>
            </>
          ) : (
            'Precio en su página'
          )}
        </p>

        {!compact &&
          (!tenant.allowOnlineBooking ? (
            <p className="mt-2 text-[13px] leading-[18px] text-portal-soft">
              No toma reservas online. En su página ves cómo reservar.
            </p>
          ) : today === undefined ? null : (
            <>
              <p className="mt-2 text-[13px] leading-[18px] font-semibold">Hoy</p>
              {today ? (
                <ul
                  aria-label="Horarios libres de hoy"
                  // Solo las píldoras quedan arriba del link de la tarjeta: el hueco a su lado
                  // sigue abriendo la ficha.
                  className="pointer-events-none relative z-20 mt-1 grid grid-cols-[repeat(auto-fill,minmax(62px,1fr))] gap-1.5"
                >
                  {today.pills.map((s) => (
                    <li key={s.time} className="pointer-events-auto">
                      <Link
                        href={buildReservarHref(tenant.slug, {
                          courtId: s.courtId,
                          date: today.date,
                          time: s.time,
                        })}
                        aria-label={`Reservar a las ${s.time}`}
                        className="ex-slot flex h-11 items-center justify-center rounded-full border border-portal-slot-line bg-portal-slot text-sm font-semibold text-portal-slot-ink tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
                      >
                        {s.time}
                      </Link>
                    </li>
                  ))}
                  {today.more > 0 && (
                    <li className="pointer-events-auto">
                      <Link
                        href={fichaHref}
                        aria-label={`Ver ${today.more} horarios más de hoy`}
                        className="ex-slot flex h-11 items-center justify-center rounded-full border border-portal-inner-line text-sm font-semibold text-portal-soft tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
                      >
                        +{today.more}
                      </Link>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] leading-[18px] text-portal-soft">
                  Hoy no le quedan horarios. Mirá otros días en su página.
                </p>
              )}
            </>
          ))}
      </div>

      {compact && (
        <FavoriteButton
          tenantId={tenant.id}
          initialFavorited={initialFavorited}
          className="absolute top-1/2 right-2 z-20 -translate-y-1/2 md:size-11"
        />
      )}
    </article>
  )
}
