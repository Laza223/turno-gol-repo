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
 * igual da el turno por jugado — el saldo que queda sigue por cobrar, no frena
 * el cobro, y el rótulo lo dice para que no se confunda con un cobro total.
 * "Por cobrar" y no "de deuda": el turno recién jugado es lo que Hoy muestra
 * como "Por cobrar", y el mismo saldo no puede tener dos nombres.
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
  if (mode === 'finish') return `Cobrar ${monto} y dar por jugado · quedan ${resto} por cobrar`
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

/**
 * Lo cobrado EN EL MOSTRADOR, sin la seña. Es la regla de `summarizeBookingCharges`
 * (la seña cuenta solo si está `paid`/`captured`) vista al revés: `totalPaid` la
 * incluye, y para saber cuánta gente puso plata acá hay que descontarla. Vive
 * en un solo lugar porque la usan el renglón de estado, "Pagaron 4 de 10" y el
 * "Equipo 1 ✓" del modal de Hoy — con tres cuentas distintas, tres respuestas.
 */
export function counterPaidCents(booking: GridBooking): number {
  const totalPaid = typeof booking.totalPaid === 'number' ? booking.totalPaid : 0
  const depositCounted =
    booking.depositStatus === 'paid' || booking.depositStatus === 'captured'
      ? (booking.depositAmount ?? 0)
      : 0
  return Math.max(0, totalPaid - depositCounted)
}

export type TeamDues = {
  /** Lo que le falta al Equipo 1 para completar su mitad. */
  team1Cents: number
  /** Lo que le falta al Equipo 2: el resto, que nunca es menor que su mitad. */
  team2Cents: number
  team1Paid: boolean
  team2Paid: boolean
}

/**
 * Lo que debe cada equipo.
 *
 * La mitad se calcula sobre lo que se le cobra a la gente en el mostrador
 * (`pending + counterPaid`, o sea precio menos seña) y NO sobre el precio: la
 * seña ya la puso quien reservó y no es de ningún equipo.
 *
 * Decisión del dueño 2026-09-25 (reabre docs/decisions/2026-09-15-cobro-por-
 * equipo.md): cuando el cobro guarda A QUÉ equipo pertenece (`team1Paid`/
 * `team2Paid` en el booking, centavos), ESE equipo se descuenta de su propia
 * mitad — ya no se deduce "el que pagó primero es el Equipo 1". Lo que no está
 * atribuido (`unattributed`: cobros viejos o de "Todo junto") sigue llenando
 * primero al Equipo 1, que es exactamente el comportamiento de siempre cuando
 * no hay atribución (p1 = p2 = 0).
 *
 * `team1Cents + team2Cents === pending` siempre: el modal nunca ofrece cobrar
 * más de lo que falta, ni aunque un equipo haya pagado de más.
 */
export function teamDues(booking: GridBooking): TeamDues {
  const pending = typeof booking.pending === 'number' && booking.pending > 0 ? booking.pending : 0
  const counterPaid = counterPaidCents(booking)
  const p1 = booking.team1Paid ?? 0
  const p2 = booking.team2Paid ?? 0
  const unattributed = Math.max(0, counterPaid - p1 - p2)
  const share = halfOfPending(pending + counterPaid)
  const team1Cents = Math.min(pending, Math.max(0, share - p1 - unattributed))
  const team2Cents = pending - team1Cents
  return {
    team1Cents,
    team2Cents,
    team1Paid: share > 0 && team1Cents === 0,
    team2Paid: share > 0 && team2Cents === 0,
  }
}

export type ChargeTab = 'all' | 'teams' | 'players'

/**
 * Cómo se puede cobrar este turno en el modal de Hoy, y con cuál abrir.
 *
 *  - **Todo junto** siempre.
 *  - **Por equipo** mientras tenga sentido: falta plata y lo cobrado hasta ahora
 *    no pasó de la mitad — si ya pagaron más que un equipo, "Equipo 2" sería un
 *    número inventado.
 *  - **Por jugador** solo si se sabe cuántos entran en la cancha: sin capacidad
 *    no hay parte que cobrar, y no se inventa un monto.
 *
 * Abre en la pestaña que corresponde a lo que ya pasó: si un equipo ya pagó,
 * en "Por equipo"; si ya pagó parte de la gente, en "Por jugador"; si no pagó
 * nadie, en "Todo junto". Así el que vuelve al turno retoma donde lo dejó.
 */
export function chargeTabs(
  booking: GridBooking,
  capacity?: number,
): { available: ChargeTab[]; initial: ChargeTab } {
  const pending = typeof booking.pending === 'number' && booking.pending > 0 ? booking.pending : 0
  const counterPaid = counterPaidCents(booking)
  const share = halfOfPending(pending + counterPaid)
  const p1 = booking.team1Paid ?? 0
  const p2 = booking.team2Paid ?? 0
  // Con pagos atribuidos, "por equipo" siempre tiene sentido: se sabe cuánto
  // debe cada uno aunque uno haya pagado de más (teamDues nunca lo manda a
  // deber negativo). Sin atribución, el heurístico de siempre: se esconde en
  // cuanto lo cobrado pasa la mitad, porque ahí "Equipo 2" sería un invento.
  const canTeams = pending > 0 && (p1 + p2 > 0 || counterPaid <= share)
  const canPlayers = pending > 0 && playerShare(booking.priceSnapshot, capacity) !== null

  const available: ChargeTab[] = ['all']
  if (canTeams) available.push('teams')
  if (canPlayers) available.push('players')

  let initial: ChargeTab = 'all'
  if (p1 + p2 > 0) {
    initial = 'teams'
  } else if (counterPaid > 0) {
    if (canTeams && counterPaid === share) initial = 'teams'
    else if (canPlayers) initial = 'players'
  }
  return { available, initial }
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
  const counterPaid = counterPaidCents(booking)

  const halfCents = halfOfPending(pending)
  const shareCents = playerShare(booking.priceSnapshot, capacity)

  if (pending <= 0) {
    return { halfCents: 0, shareCents, canSplitHalf: false, canSplitShare: false, note: null }
  }

  // Estrictamente mayor: cuando lo que falta ES una parte, el botón grande ya
  // dice "Cobrar $6.000" y ofrecer los dos sería el mismo cobro dos veces.
  const canSplitShare = shareCents !== null && pending > shareCents
  const canSplitHalf = counterPaid === 0

  const p1 = booking.team1Paid ?? 0
  const p2 = booking.team2Paid ?? 0
  const note =
    p1 > 0 || p2 > 0 ? attributedSplitNote(booking) : splitNote(counterPaid, shareCents, capacity)

  return {
    halfCents,
    shareCents,
    canSplitHalf,
    canSplitShare,
    note,
  }
}

/**
 * El renglón de estado cuando hay pagos ATRIBUIDOS a un equipo (decisión del
 * dueño 2026-09-25): mismo vocabulario que la nota sin atribuir cuando un solo
 * equipo terminó de pagar, y el desglose de los dos montos cuando los dos
 * todavía deben.
 */
function attributedSplitNote(booking: GridBooking): string {
  const { team1Cents, team2Cents, team1Paid, team2Paid } = teamDues(booking)
  if (team1Paid && !team2Paid) return 'Equipo 1 pagó · falta Equipo 2'
  if (team2Paid && !team1Paid) return 'Equipo 2 pagó · falta Equipo 1'
  return `Equipo 1: faltan ${formatArs(team1Cents)} · Equipo 2: faltan ${formatArs(team2Cents)}`
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
