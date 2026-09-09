import { formatArs } from '@/lib/format'
import { reservaStatusVisual } from './status-visual'
import type { ReservaListRow } from './queries'

/**
 * Qué dice la fila sobre la plata REAL del turno (no sobre la seña).
 * Aditivo: `depositText` de arriba no se toca — "Sin seña" sigue siendo
 * cierto, esto agrega el dato que faltaba al lado.
 */
export function moneyLine(
  b: Pick<
    ReservaListRow,
    'pending' | 'totalPaid' | 'status' | 'priceSnapshot' | 'type' | 'depositStatus'
  >,
): { text: string; tone: 'pending' | 'paid' } | null {
  // Reservas que no se van a jugar: la seña se resuelve aparte (devuelta o
  // retenida como penalidad) y el resto del precio nunca se cobra.
  // `summarizeBookingCharges` no sabe esto — solo cuenta seña `paid`/`captured`
  // como cobrada — así que sin este corte `pending` queda > 0 y "Falta $X"
  // afirmaría una deuda que no existe al lado de "Seña devuelta"/"pagada".
  // `no_show` entra en el mismo corte por otro motivo (veto "No-show NO es
  // deuda"): lo que queda sin cobrar en un no-show no es cobrable, así que
  // "Falta $X" tampoco puede afirmarse ahí.
  if (
    b.status === 'canceled_refunded' ||
    b.status === 'canceled_no_refund' ||
    b.status === 'expired' ||
    b.status === 'no_show'
  ) {
    return null
  }
  if (typeof b.pending !== 'number') return null
  if (b.pending > 0) {
    // Arriba de esta línea la fila ya muestra el precio del turno. Si no se
    // cobró NADA, `pending` es ese mismo número: repetirlo apila "$ 40.000" y
    // "Falta $ 40.000" uno debajo del otro y hay que leer los dos para entender
    // que son lo mismo. El monto solo aporta cuando hubo un cobro parcial.
    if (b.pending >= b.priceSnapshot) {
      // ...y cuando el turno ya se jugó, la píldora de alarma al lado del badge
      // dice EXACTAMENTE estas dos palabras (`RESERVA_UNPAID_VISUAL`, label
      // 'Sin cobrar'). Escribirlas otra vez acá abajo deja la fila diciendo
      // "Sin cobrar" dos veces —y el aria-label del Link, también—, que es el
      // mismo ruido que este renglón vino a sacar.
      return reservaStatusVisual(b).unpaid ? null : { text: 'Sin cobrar', tone: 'pending' }
    }
    return { text: `Falta ${formatArs(b.pending)}`, tone: 'pending' }
  }
  if ((b.totalPaid ?? 0) > 0) return { text: 'Cobrado', tone: 'paid' }
  return null
}
