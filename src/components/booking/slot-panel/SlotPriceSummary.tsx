import { User } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import type { GridBooking } from '@/lib/booking/grid-cells'

type Props = {
  booking: GridBooking
  displayName: string | null
}

/**
 * La plata del turno, con lo que falta adelante.
 *
 * Antes era una tabla de tres filas —precio, cobrado, pendiente— leída siempre
 * para lo mismo: saber cuánto falta. Ahora esa respuesta está en grande y el
 * resto queda como pie de página, que es el peso que tiene.
 */
export function SlotPriceSummary({ booking, displayName }: Props) {
  const pending = typeof booking.pending === 'number' ? booking.pending : null
  const paid = typeof booking.totalPaid === 'number' ? booking.totalPaid : null

  const detail: string[] = []
  if (booking.type !== 'tournament') detail.push(`Precio ${formatArs(booking.priceSnapshot)}`)
  if (paid !== null) detail.push(`Cobrado ${formatArs(paid)}`)
  if (booking.paymentMethod) detail.push(METHOD_LABELS[booking.paymentMethod])

  return (
    <section className="rounded-lg border border-border p-3">
      {pending !== null && pending > 0 ? (
        <p>
          <span className="block text-xs font-medium text-muted-foreground">Falta cobrar</span>
          <span className="block text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">
            {formatArs(pending)}
          </span>
        </p>
      ) : (
        <p>
          <span className="block text-xs font-medium text-muted-foreground">Cobrado</span>
          <span className="block text-2xl font-bold tabular-nums text-foreground">
            {formatArs(paid ?? booking.priceSnapshot)}
          </span>
        </p>
      )}

      {detail.length > 0 && (
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{detail.join(' · ')}</p>
      )}

      {displayName && (
        <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
          <User aria-hidden className="h-3.5 w-3.5" />
          {displayName}
        </p>
      )}
    </section>
  )
}
