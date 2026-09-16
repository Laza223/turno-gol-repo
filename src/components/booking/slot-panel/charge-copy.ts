import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Qué significa "cobrar" para este turno. Los tres caminos existen porque el
 * backend valida estados distintos, no por gusto:
 *  - `settle`  — el turno ya se jugó y quedó saldo (chargeDebtAction exige
 *                status 'completed').
 *  - `finish`  — está confirmado y ya terminó: cobrar y darlo por jugado en el
 *                mismo movimiento, que es lo que realmente pasa en el mostrador.
 *  - `advance` — todavía no terminó: es un adelanto, y el backend sólo acepta
 *                una línea, así que el mixto se deshabilita en vez de mentir.
 */
export type ChargeMode = 'settle' | 'finish' | 'advance' | null

export function chargeMode(booking: GridBooking, hasEnded: boolean): ChargeMode {
  const pending = booking.pending
  if (typeof pending !== 'number' || pending <= 0) return null
  if (booking.type === 'block' || booking.type === 'tournament') return null
  if (booking.status === 'completed') return 'settle'
  if (booking.status === 'confirmed') return hasEnded ? 'finish' : 'advance'
  return null
}

/**
 * El rótulo del botón que cobra, con el monto adentro.
 *
 * El monto va EN el botón y no en un campo aparte: es lo que falta, el panel ya
 * lo sabe, y verlo antes de tocar es lo que evita tener que leer una tabla para
 * saber qué se está por cobrar.
 *
 * H017: el verbo es siempre "cobrar". Antes el título y el botón del MISMO panel
 * decían cosas distintas ("cerrar"/"registrar"), y "cerrar" además es el verbo
 * reservado para el cierre de caja.
 *
 * D3 (2026-09-15): el monto ahora se puede editar a la vista (ya no vive
 * detrás de "Cobrar otro monto"), así que el botón tiene que reflejar lo que
 * el admin tipeó, no siempre el pendiente completo. En `finish` un parcial
 * igual da el turno por jugado — el saldo que queda es deuda, no algo que
 * frene el cobro, y el rótulo lo dice para que no se confunda con un cobro
 * total.
 *
 * Revisión (yellow): el monto NO se clampea contra `pendingCents`. Si lo
 * tipeado queda por encima del pendiente (p. ej. por la corrupción de
 * `money.ts` al editar un valor ya agrupado en miles), clampear lo escondía:
 * el botón mostraba el pendiente completo con rótulo de cobro normal y recién
 * al hacer click aparecía el error citando un monto que el admin nunca vio en
 * pantalla. Mostrar el monto real deja la discordancia a la vista ANTES de
 * tocar "Cobrar".
 */
export function chargeCta(
  mode: Exclude<ChargeMode, null>,
  pendingCents: number,
  amountCents: number,
): string {
  const monto = formatArs(amountCents)
  if (amountCents > pendingCents) {
    return `Cobrar ${monto} · supera lo pendiente (${formatArs(pendingCents)})`
  }
  const isFull = amountCents > 0 && amountCents === pendingCents
  if (isFull) {
    if (mode === 'finish') return `Cobrar ${monto} y dar por jugado`
    if (mode === 'advance') return `Cobrar ${monto} por adelantado`
    return `Cobrar ${monto}`
  }
  const resto = formatArs(pendingCents - amountCents)
  if (mode === 'finish') return `Cobrar ${monto} y dar por jugado · quedan ${resto} de deuda`
  if (mode === 'advance') return `Cobrar ${monto} por adelantado · quedan ${resto}`
  return `Cobrar ${monto} · quedan ${resto}`
}

/**
 * La mitad de lo que falta, para el cobro por equipo.
 *
 * Redondea para ARRIBA: el primero paga el peso de más y el segundo nunca queda
 * con un saldo de un centavo colgado, que en el mostrador no se cobra y deja el
 * turno figurando como deuda para siempre.
 *
 * Vive acá y no inline en cada botón porque son dos pantallas (el panel de la
 * grilla y el diálogo de `/reservas`) y tienen que partir igual.
 */
export function halfOfPending(pendingCents: number): number {
  return pendingCents > 0 ? Math.ceil(pendingCents / 2) : 0
}

export type TeamSplit = {
  /** La mitad de lo que falta. Lo que carga el atajo "Cobrar la mitad". */
  halfCents: number
  /** Si corresponde ofrecer el atajo: hay saldo y todavía no pagó nadie. */
  canSplit: boolean
  /** Rótulo del estado por equipos para el panel, o `null` si no aporta nada. */
  note: string | null
}

/**
 * Cobrar por equipo, que es como se cobra en la mayoría de los complejos: el
 * turno es uno solo pero la plata entra en dos momentos y de dos manos, y el
 * que está en el mostrador necesita ver cuál de los dos ya pagó.
 *
 * Todo sale de datos que el panel YA tiene. No hay columna nueva ni etiqueta
 * guardada: "Equipo 1 / Equipo 2" es presentación, y lo que de verdad distingue
 * a los dos cobros es que uno ya está y el otro no.
 *
 * La seña NO cuenta como "un equipo pagó" — se descuenta con la MISMA regla que
 * `summarizeBookingCharges` (`paid`/`captured` y nada más). Sin esto, un turno
 * señado online por el jugador diría "Equipo 1 pagó" sin que nadie haya puesto
 * un peso en el mostrador.
 *
 * Límite conocido: el panel sabe CUÁNTO se cobró, no en cuántas veces. Si el
 * mostrador partió el turno en tres, el rótulo igual dice "Equipo 1 / Equipo 2";
 * el monto que falta, que es lo que decide qué cobrar, sigue siendo exacto. La
 * lista del detalle de la reserva sí tiene las filas y ahí el rótulo se apaga
 * cuando son más de dos.
 */
export function teamSplit(booking: GridBooking): TeamSplit {
  const pending = typeof booking.pending === 'number' ? booking.pending : 0
  const totalPaid = typeof booking.totalPaid === 'number' ? booking.totalPaid : 0
  const depositCounted =
    booking.depositStatus === 'paid' || booking.depositStatus === 'captured'
      ? (booking.depositAmount ?? 0)
      : 0
  const counterPaid = Math.max(0, totalPaid - depositCounted)

  const halfCents = halfOfPending(pending)

  if (pending <= 0) return { halfCents: 0, canSplit: false, note: null }
  if (counterPaid > 0) {
    return { halfCents, canSplit: false, note: 'Equipo 1 pagó · falta Equipo 2' }
  }
  return { halfCents, canSplit: true, note: null }
}
