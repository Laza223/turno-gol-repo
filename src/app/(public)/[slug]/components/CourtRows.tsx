import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatLabel } from '@/components/public/courtFacets'
import type { HourRow } from '@/lib/booking/hour-summary'
import { buildReserveRequest, buildReservarHref } from '@/lib/booking/reserve-url'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'

const ROW =
  'flex min-h-[72px] items-center gap-3 rounded-xl border border-input bg-card px-4 py-3 text-foreground transition-colors duration-150 active:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * Las canchas libres a la hora elegida: el paso 3, una tarjeta por cancha. Tocar una lleva a
 * confirmar (`/reservar?court&date&time&dur`); sin reserva online abre WhatsApp con el pedido
 * escrito, o marca el teléfono si el número no sirve para WhatsApp. El precio sale solo si el
 * slot lo trae Y el complejo no los oculta: el servidor ya manda `null`, esto es la segunda llave.
 * El título del paso lo pone quien la monta.
 */
export default function CourtRows({
  tenant,
  row,
  date,
  formato = null,
}: {
  tenant: Pick<PublicTenant, 'slug' | 'allowOnlineBooking' | 'hidePrices' | 'phone' | 'whatsapp'>
  row: HourRow
  date: string
  /** El filtro de formato de la ficha: viaja a confirmar para que "Volver" lo conserve. */
  formato?: number | null
}) {
  return (
    <ul aria-label={`Canchas libres a las ${row.time}`} className="space-y-2">
      {row.courts.map((court) => {
        const price =
          !tenant.hidePrices && court.price != null ? (
            <span className="font-semibold tabular-nums">{formatArs(court.price)}</span>
          ) : null
        const body = (action: string | null) => (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-semibold leading-6">{court.name}</span>
              <span className="block text-sm leading-5 text-muted-foreground">
                {formatLabel(court.format)}
              </span>
            </span>
            {price}
            {action ? (
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {action}
              </span>
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <ChevronRight className="size-5 text-foreground" aria-hidden />
              </span>
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
  )
}
