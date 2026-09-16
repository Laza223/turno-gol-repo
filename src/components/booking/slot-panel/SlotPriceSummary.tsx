import { User } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { teamSplit } from './charge-copy'

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
  const split = teamSplit(booking)

  const detail: string[] = []
  if (booking.type !== 'tournament' && booking.priceSnapshot !== 0) {
    detail.push(`Precio ${formatArs(booking.priceSnapshot)}`)
  }
  if (paid !== null && booking.priceSnapshot !== 0) detail.push(`Cobrado ${formatArs(paid)}`)
  if (booking.paymentMethod) detail.push(METHOD_LABELS[booking.paymentMethod])

  return (
    <section className="rounded-lg border border-border p-3">
      {booking.priceSnapshot === 0 ? (
        // Rediseño 2026-09-14: "No se cobra" (priceOverride 0). "Cobrado $0"
        // sonaba a que sí se cobró un monto nulo — esto es un turno que nunca
        // tuvo precio, no un pago de cero pesos.
        <p>
          <span className="block text-xs font-medium text-muted-foreground">Precio</span>
          <span className="block text-2xl font-bold tabular-nums text-foreground">Sin costo</span>
        </p>
      ) : pending !== null && pending > 0 ? (
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

      {/* Cobro por equipo: renglón propio y no un ítem más del pie, porque no es
          un dato del turno sino el estado de quién falta — es lo que el
          mostrador necesita para no cobrarle dos veces al mismo. */}
      {split.note && (
        <p className={cn('mt-1.5 text-xs font-medium', TONE_TEXT.warning)}>{split.note}</p>
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
