import type { Ref } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatLabel } from '@/components/public/courtFacets'
import type { HourRow } from '@/lib/booking/hour-summary'
import { buildReserveRequest, buildReservarHref } from '@/lib/booking/reserve-url'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { PROFILE_SECTION_TITLE } from './styles'

const ROW =
  'flex min-h-16 items-center gap-3 rounded-xl border border-input bg-card px-4 py-2 text-foreground transition-[color,border-color,box-shadow,translate] duration-150 hover:-translate-y-0.5 hover:border-emerald-400/60 hover:shadow-md hover:shadow-emerald-500/10 motion-reduce:hover:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * Las canchas libres a la hora elegida, en el lugar, debajo de las horas. Tocar una fila lleva a
 * confirmar (`/reservar?court&date&time&dur`); sin reserva online abre WhatsApp con el pedido
 * escrito, o marca el teléfono si el número no sirve para WhatsApp. El precio sale solo si el
 * slot lo trae Y el complejo no los oculta: el servidor ya manda `null`, esto es la segunda llave.
 *
 * `ref` y `className` los pone quien la monta: el `scroll-margin-bottom` tiene que descontar la
 * barra inferior del jugador logueado, que esta pieza no conoce.
 */
export default function CourtRows({
  tenant,
  row,
  date,
  formato = null,
  ref,
  className,
}: {
  tenant: Pick<PublicTenant, 'slug' | 'allowOnlineBooking' | 'hidePrices' | 'phone' | 'whatsapp'>
  row: HourRow
  date: string
  /** El filtro de formato de la ficha: viaja a confirmar para que "Volver" lo conserve. */
  formato?: number | null
  ref?: Ref<HTMLElement>
  className?: string
}) {
  return (
    <section ref={ref} aria-labelledby="canchas-libres" className={className}>
      <h2 id="canchas-libres" className={PROFILE_SECTION_TITLE}>
        Canchas libres a las {row.time}
      </h2>
      <ul className="mt-2 space-y-2">
        {row.courts.map((court) => {
          const price =
            !tenant.hidePrices && court.price != null ? (
              <span className="font-semibold tabular-nums">{formatArs(court.price)}</span>
            ) : null
          const body = (action: string | null) => (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold">{court.name}</span>
                <span className="block text-[13px] leading-5 text-muted-foreground">
                  {formatLabel(court.format)}
                </span>
              </span>
              {price}
              {action ? (
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {action}
                </span>
              ) : (
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              )}
            </>
          )

          if (tenant.allowOnlineBooking) {
            return (
              <li key={court.id}>
                <Link
                  href={buildReservarHref(tenant.slug, {
                    courtId: court.id,
                    date,
                    time: row.time,
                    formato,
                  })}
                  className={ROW}
                >
                  {body(null)}
                </Link>
              </li>
            )
          }
          const request = buildReserveRequest(tenant, court, date, row.time)
          return (
            <li key={court.id}>
              {request ? (
                <a
                  href={request.href}
                  {...(request.channel === 'whatsapp'
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className={ROW}
                >
                  {body(request.channel === 'whatsapp' ? 'WhatsApp' : 'Llamar')}
                </a>
              ) : (
                <div className={cn(ROW, 'text-muted-foreground')}>{body(null)}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
