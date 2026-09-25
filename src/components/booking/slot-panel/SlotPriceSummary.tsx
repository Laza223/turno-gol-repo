import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { chargeSplit } from './charge-copy'

type Props = {
  booking: GridBooking
  /** Jugadores de la cancha. Sin esto el renglon dice equipos y no cuenta gente. */
  capacity?: number
}

/**
 * La plata del turno, con lo que falta adelante.
 *
 * Antes era una tabla de tres filas —precio, cobrado, pendiente— leída siempre
 * para lo mismo: saber cuánto falta. Ahora esa respuesta está en grande y el
 * resto queda como pie de página, que es el peso que tiene.
 */
export function SlotPriceSummary({ booking, capacity }: Props) {
  const pending = typeof booking.pending === 'number' ? booking.pending : null
  const paid = typeof booking.totalPaid === 'number' ? booking.totalPaid : null
  const split = chargeSplit(booking, capacity)

  const detail: string[] = []
  if (booking.type !== 'tournament' && booking.priceSnapshot !== 0) {
    detail.push(`Precio ${formatArs(booking.priceSnapshot)}`)
  }
  if (paid !== null && booking.priceSnapshot !== 0) detail.push(`Cobrado ${formatArs(paid)}`)
  if (booking.paymentMethod) detail.push(METHOD_LABELS[booking.paymentMethod])

  return (
    // Sin recuadro: es el primer bloque del panel y lo que tiene que gritar es
    // el numero, no una caja alrededor del numero.
    <section>
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
          {/* Ámbar, el tono de lo pendiente: lo que falta cobrar de un turno no es
              un error ni una deuda (principio 3 de PRODUCT.md). */}
          <span className={cn('block text-2xl font-bold tabular-nums', TONE_TEXT.warning)}>
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

      {/* Cobro de a partes: renglón propio y no un ítem más del pie, porque no
          es un dato del turno sino cuánta gente falta — es lo que el mostrador
          necesita para no cobrarle dos veces al mismo. El MONTO no se repite
          acá: ya está arriba en grande, y dos maquetas para un dato es lo que
          el rediseño de Caja sacó a propósito. */}
      {split.note && (
        <p className={cn('mt-1.5 text-xs font-medium', TONE_TEXT.warning)}>{split.note}</p>
      )}
    </section>
  )
}
