import { User } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import type { GridBooking } from '@/lib/booking/grid-cells'

type Props = {
  booking: GridBooking
  displayName: string | null
}

/** Precio, cobrado, pendiente y método del turno — más quién lo reservó. */
export function SlotPriceSummary({ booking, displayName }: Props) {
  return (
    <section className="rounded-lg border border-border p-3">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Precio del turno</dt>
          <dd className="font-semibold tabular-nums">{formatArs(booking.priceSnapshot)}</dd>
        </div>
        {typeof booking.totalPaid === 'number' && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Cobrado</dt>
            <dd className="font-semibold tabular-nums">{formatArs(booking.totalPaid)}</dd>
          </div>
        )}
        {typeof booking.pending === 'number' && (
          <div className="flex justify-between border-t border-border pt-1.5">
            <dt className="font-medium">Pendiente</dt>
            <dd
              className={`font-semibold tabular-nums ${
                booking.pending > 0 ? 'text-red-700 dark:text-red-300' : ''
              }`}
            >
              {formatArs(booking.pending)}
            </dd>
          </div>
        )}
        {booking.paymentMethod && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Pago</dt>
            <dd>{METHOD_LABELS[booking.paymentMethod]}</dd>
          </div>
        )}
      </dl>
      {displayName && (
        <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
          <User aria-hidden className="h-3.5 w-3.5" />
          {displayName}
        </p>
      )}
    </section>
  )
}
