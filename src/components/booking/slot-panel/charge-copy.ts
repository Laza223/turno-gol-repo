import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Qué significa "cobrar" para este turno. Los tres caminos existen porque el
 * backend valida estados distintos, no por gusto:
 *  - `settle`  — el turno ya se jugó y quedó saldo (chargeDebtAction exige
 *                status 'completed').
 *  - `finish`  — está confirmado y ya terminó: cobrar y darlo por jugado en el
 *                mismo movimiento, que es lo que realmente pasa en el mostrador.
 *  - `advance` — todavía no terminó: es un adelanto (addBookingChargeAction, que
 *                desde D3 acepta N líneas, igual que los otros dos modos).
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

/**
 * Lo que le toca a UN jugador: el precio del turno dividido por los jugadores
 * que entran en esa cancha (`courts.capacity`, que es `format × 2`).
 *
 * Sobre el PRECIO del turno y no sobre lo pendiente: la parte de cada uno no
 * cambia porque otro ya haya pagado. Si hay seña, esa seña cubre las primeras
 * partes y el pendiente baja solo.
 *
 * Redondea para arriba por el mismo motivo que la mitad: el último no queda con
 * centavos colgados. Devuelve `null` si no sabemos la capacidad — ahí el botón
 * "Pagó uno" simplemente no se ofrece, en vez de inventar un monto.
 */
export function playerShare(priceSnapshot: number, capacity: number | undefined): number | null {
  if (!capacity || capacity <= 0 || priceSnapshot <= 0) return null
  return Math.ceil(priceSnapshot / capacity)
}

export type ChargeSplit = {
  /** La mitad de lo que falta. Lo que precarga cada fila de "Dividir pago por equipo". */
  halfCents: number
  /** Lo que pone un jugador. `null` si no sabemos cuántos entran en la cancha. */
  shareCents: number | null
  /** Ofrecer "Dividir pago por equipo": hay saldo y todavía no pagó nadie. */
  canSplitHalf: boolean
  /** Ofrecer "Pagó uno": sabemos la parte y todavía falta más de una. */
  canSplitShare: boolean
  /** Rótulo del estado para el panel, o `null` si no aporta nada. */
  note: string | null
}

/**
 * Cobrar de a partes, que es como cobra la mayoría de los complejos: el turno es
 * uno solo pero la plata entra de a poco — a veces por equipo, a veces jugador
 * por jugador, que es lo más frecuente. El que está en el mostrador necesita
 * saber a ojo cuánto ya entró y cuánto falta, sin contar de memoria.
 *
 * Todo sale de datos que el panel YA tiene. No hay columna nueva ni nada
 * guardado: "Equipo 1 / Equipo 2" y "Pagaron 4 de 10" son presentación. **El
 * sistema no registra quién es cada uno** — sin nombre, sin ficha, sin deuda por
 * persona. El reclamo sigue siendo al que reservó, como en la vida real.
 *
 * La seña NO cuenta como parte pagada en el mostrador — se descuenta con la
 * MISMA regla que `summarizeBookingCharges` (`paid`/`captured` y nada más). Sin
 * esto, un turno señado online por el jugador diría que ya pagó gente.
 *
 * Límite conocido y asumido: el panel sabe CUÁNTO se cobró, no en cuántas veces,
 * así que la cantidad se deduce dividiendo por la parte. Si alguien cobró un
 * monto suelto por "Cobrar otro monto", el conteo puede quedar corrido — por eso
 * el número grande del panel sigue siendo lo que FALTA, que nunca se deduce.
 * Contar las filas exactas pediría traer los cobros de cada turno a la grilla, y
 * eso es la consulta por turno que `sumBookingChargesByBooking` evita a
 * propósito.
 */
export function chargeSplit(booking: GridBooking, capacity?: number): ChargeSplit {
  const pending = typeof booking.pending === 'number' ? booking.pending : 0
  const totalPaid = typeof booking.totalPaid === 'number' ? booking.totalPaid : 0
  const depositCounted =
    booking.depositStatus === 'paid' || booking.depositStatus === 'captured'
      ? (booking.depositAmount ?? 0)
      : 0
  const counterPaid = Math.max(0, totalPaid - depositCounted)

  const halfCents = halfOfPending(pending)
  const shareCents = playerShare(booking.priceSnapshot, capacity)

  if (pending <= 0) {
    return { halfCents: 0, shareCents, canSplitHalf: false, canSplitShare: false, note: null }
  }

  // Estrictamente mayor: cuando lo que falta ES una parte, el botón grande ya
  // dice "Cobrar $6.000" y ofrecer los dos sería el mismo cobro dos veces.
  const canSplitShare = shareCents !== null && pending > shareCents
  const canSplitHalf = counterPaid === 0

  return {
    halfCents,
    shareCents,
    canSplitHalf,
    canSplitShare,
    note: splitNote(counterPaid, shareCents, capacity),
  }
}

/** El renglón de estado. El monto NO va acá: ya está arriba, en grande. */
function splitNote(
  counterPaid: number,
  shareCents: number | null,
  capacity: number | undefined,
): string | null {
  if (counterPaid <= 0) return null
  if (shareCents !== null && capacity) {
    const paidCount = Math.round(counterPaid / shareCents)
    if (paidCount <= 0) return null
    // Justo la mitad: el dato útil no es "5 de 10" sino que un equipo entero
    // está saldado — y con el mismo vocabulario que las filas de "Dividir pago
    // por equipo", para que el panel no nombre lo mismo de dos maneras.
    if (paidCount * 2 === capacity) return 'Equipo 1 pagó · falta Equipo 2'
    return `Pagaron ${paidCount} de ${capacity}`
  }
  // Sin capacidad no se puede contar gente, pero sí decir que falta la otra
  // mitad — que era el rótulo original y sigue siendo cierto.
  return 'Equipo 1 pagó · falta Equipo 2'
}
