import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { chargeSplit, counterPaidCents } from './charge-copy'

type Props = {
  booking: GridBooking
  /** Jugadores de la cancha. Sin esto el renglon dice equipos y no cuenta gente. */
  capacity?: number
  /** Se jugó y no se cobró: lo que falta va en rojo, como "No cobrado" en la Grilla. */
  late?: boolean
}

/**
 * La plata del turno, con lo que falta adelante.
 *
 * Antes era una tabla de tres filas —precio, cobrado, pendiente— leída siempre
 * para lo mismo: saber cuánto falta. Ahora esa respuesta está en grande y el
 * resto queda como pie de página, que es el peso que tiene.
 */
export function SlotPriceSummary({ booking, capacity, late = false }: Props) {
  const pending = typeof booking.pending === 'number' ? booking.pending : null
  const paid = typeof booking.totalPaid === 'number' ? booking.totalPaid : null
  const split = chargeSplit(booking, capacity)
  const isSettled = Boolean(booking.settlementId)
  const isMonthlyUnsettled =
    !isSettled && booking.abonadoBillingMode === 'monthly' && booking.priceSnapshot === 0

  const detail: string[] = []
  if (booking.type !== 'tournament' && booking.priceSnapshot !== 0 && !isSettled) {
    detail.push(`Precio ${formatArs(booking.priceSnapshot)}`)
  }
  // La seña se nombra aparte: mezclada en "Cobrado" el encargado no sabe si falta la seña o el resto.
  const depositPaid =
    (booking.depositStatus === 'paid' || booking.depositStatus === 'captured') &&
    (booking.depositAmount ?? 0) > 0
      ? (booking.depositAmount ?? 0)
      : 0
  if (isSettled) {
    // Cubierto por pack, mes o saldado: lo que se cobró de este turno suelto no se desglosa.
  } else if (depositPaid > 0 && booking.priceSnapshot !== 0) {
    const how = booking.paymentMethod ? ` (${METHOD_LABELS[booking.paymentMethod]})` : ''
    detail.push(`Seña pagada ${formatArs(depositPaid)}${how}`)
    detail.push(`Cobrado en el complejo ${formatArs(counterPaidCents(booking))}`)
  } else {
    if (paid !== null && booking.priceSnapshot !== 0) detail.push(`Cobrado ${formatArs(paid)}`)
    if (booking.paymentMethod) detail.push(METHOD_LABELS[booking.paymentMethod])
  }

  return (
    // Sin recuadro: es el primer bloque del panel y lo que tiene que gritar es
    // el numero, no una caja alrededor del numero.
    <section>
      {isSettled ? (
        <p>
          <span className="block text-xs font-medium text-muted-foreground">Cobro</span>
          <span className={cn('block text-2xl font-bold tabular-nums', TONE_TEXT.success)}>
            Saldado
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {booking.settlementKind === 'monthly'
              ? 'Cubierto por el mes'
              : booking.settlementKind === 'pack'
                ? 'Cubierto por el pack de turnos'
                : booking.settlementOrigin === 'already_settled'
                  ? 'Ya estaba saldado, no suma a Caja'
                  : 'Cobrado junto con otros turnos'}
          </span>
        </p>
      ) : isMonthlyUnsettled ? (
        <p>
          <span className="block text-xs font-medium text-muted-foreground">Cobro</span>
          <span
            className={cn(
              'block text-2xl font-bold tabular-nums',
              late ? TONE_TEXT.warning : 'text-foreground',
            )}
          >
            {late ? 'Mes sin saldar' : 'Por mes'}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Este turno fijo se cobra por mes, no por turno.
          </span>
        </p>
      ) : booking.priceSnapshot === 0 ? (
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
          {/* Rojo si ya se jugó (decisión del dueño, 2026-09-25: un turno jugado y
              sin cobrar es plata que no entró, y el ámbar no se sentía urgente);
              antes de que termine todavía se cobra a tiempo y va sin color. Nunca
              "deuda": es un turno no cobrado (principio 3 de PRODUCT.md). */}
          <span
            className={cn(
              'block text-2xl font-bold tabular-nums',
              late ? TONE_TEXT.destructive : 'text-foreground',
            )}
          >
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
      {split.note && <p className="mt-1.5 text-xs font-medium text-foreground">{split.note}</p>}
    </section>
  )
}
