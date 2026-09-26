import { formatArs } from '@/lib/format'
import type { StatusTone } from '@/lib/status-tone'
import type { ReservaListRow } from './queries'

/**
 * La plata de una fila de la Agenda, en UNA sola lectura (a diferencia del
 * listado viejo: sin precio + badge de estado + píldora "No cobrado"
 * apilados — "Nada de columnas de 'Seña'/badges apilados", decisión del
 * dueño). Reusa los mismos hechos que `reservaHasEnded` (pending,
 * totalPaid, ended): no reinventa CUÁNDO algo está pendiente o terminado,
 * solo cómo se redacta en un solo texto.
 *
 * Orden de prioridad — el primero que matchea gana:
 * cancelada/expirada/ausente/esperando seña (el `status` manda) → sin cargo
 * (bloqueo, evento gratis) → jugado y no cobrado (rojo) → por jugar (gris).
 */
export function agendaMoneyCell(
  b: Pick<
    ReservaListRow,
    'pending' | 'totalPaid' | 'status' | 'priceSnapshot' | 'type' | 'depositAmount'
  >,
  ended: boolean,
): { text: string; tone: StatusTone } {
  if (b.status === 'canceled_refunded' || b.status === 'canceled_no_refund') {
    return { text: 'Cancelada', tone: 'neutral' }
  }
  if (b.status === 'expired') return { text: 'Expirada', tone: 'neutral' }
  // Veto "No-show NO es deuda": un ausente nunca es plata pendiente, aunque
  // `pending` venga > 0 — por eso gris, no rojo.
  if (b.status === 'no_show') return { text: 'Ausente', tone: 'neutral' }
  if (b.status === 'pending_payment') return { text: 'Esperando seña', tone: 'warning' }
  // Un bloqueo no es un turno de nadie: no se dice nada de plata (el ícono y
  // "Bloqueo" ya lo explican). Un evento a $0 (escuelita, cortesía) sí es un
  // turno, y ahí "Sin cargo" responde "¿cuánto se cobra?".
  if (b.type === 'block') return { text: '', tone: 'neutral' }
  if (b.priceSnapshot === 0) return { text: 'Sin cargo', tone: 'neutral' }
  if (typeof b.pending !== 'number') return { text: formatArs(b.priceSnapshot), tone: 'neutral' }
  if (b.pending <= 0) {
    return (b.totalPaid ?? 0) > 0
      ? { text: 'Pagado', tone: 'success' }
      : { text: 'Sin costo', tone: 'neutral' }
  }
  if (ended) {
    // Nada cobrado todavía: el monto completo. Cobro parcial (seña o mostrador):
    // "Falta $X" es más preciso que repetir "No cobrado" sobre plata que sí entró.
    return (b.totalPaid ?? 0) > 0
      ? { text: `Falta ${formatArs(b.pending)}`, tone: 'destructive' }
      : { text: `No cobrado · ${formatArs(b.pending)}`, tone: 'destructive' }
  }
  // Todavía no se juega (o se está jugando): sin nada cobrado se ve el precio
  // entero; con una seña ya paga, lo que falta.
  return b.pending < b.priceSnapshot
    ? { text: `Falta ${formatArs(b.pending)}`, tone: 'neutral' }
    : { text: formatArs(b.priceSnapshot), tone: 'neutral' }
}
