/**
 * La cola de Hoy: a qué turnos hay que cobrarles AHORA y, cuando no queda
 * nada, cuáles vienen. Función pura — recibe los turnos del día, el orden de
 * las canchas y un instante — para que se pueda probar con relojes fijos y
 * recalcular en el cliente cada medio minuto sin volver al servidor.
 *
 * Rediseño del 2026-09-25 (docs/decisions/2026-09-25-hoy-cobrar-ahora.md): Hoy
 * dejó de ser un tablero con todos los turnos del día. Mezclar los que vienen
 * con los que hay que cobrar hacía que los segundos no se miraran, y el complejo
 * piloto juntó cientos de miles de pesos en turnos jugados sin cobrar. Un turno
 * entra a la cola cuando LLEGA SU HORA, no cuando termina: desde que empieza se
 * le puede cobrar, y si termina sin cobrarse pasa a ser urgente.
 *
 * "Ya terminó" sale de `endsAt`, el instante físico que también valida el
 * servidor, y NO de la hora de pared del turno: `time_end='24:00'` y los slots
 * de madrugada de un complejo `closes_next_day` hacen que comparar strings de
 * hora dé la respuesta equivocada (`slotHasPassed`, operating-day.ts).
 */
import type { GridBooking } from '@/lib/booking/grid-cells'
import { relativeTimeEs } from '@/lib/format'

/** Un turno del día con sus instantes físicos en milisegundos. */
export type BoardBooking = GridBooking & { startsAtMs: number; endsAtMs: number }

/** Un turno para cobrar ahora. `ended`: ya terminó, o sea que se jugó y no se cobró. */
type QueueItem = { booking: BoardBooking; ended: boolean }

export type ChargeQueue = {
  /**
   * Empezados y con saldo: primero los que terminaron, el más reciente arriba
   * (es el grupo que está pasando por el mostrador), y después los que se están
   * jugando. Dentro de cada tanda, en el orden de las canchas de la Grilla.
   */
  now: QueueItem[]
  /** Los que todavía no empezaron, por hora y cancha: lo que Hoy muestra cuando no hay nada para cobrar. */
  upcoming: BoardBooking[]
  /** Si ya empezó algún turno hoy: separa "todo cobrado" de "todavía no se jugó nada". */
  anyStarted: boolean
}

/** ¿El turno ya terminó a `nowMs`? Un turno que termina justo ahora ya terminó. */
export function hasEndedAt(booking: Pick<BoardBooking, 'endsAtMs'>, nowMs: number): boolean {
  return booking.endsAtMs <= nowMs
}

/**
 * ¿Hay que cobrarle a este turno ahora? El mismo criterio que `chargeMode` (el
 * modal ofrece cobrar exactamente a estos): saldo conocido y positivo, turno de
 * un cliente (una hora de torneo se paga con la inscripción y un bloqueo no es
 * de nadie), confirmado o ya jugado — y además que haya llegado su hora.
 * Una cancha pausada no lo saca: la plata de un turno que se jugó sigue siendo plata.
 */
function isDueNow(booking: BoardBooking, nowMs: number): boolean {
  if (typeof booking.pending !== 'number' || booking.pending <= 0) return false
  if (booking.type === 'block' || booking.type === 'tournament') return false
  if (booking.status === 'completed') return true
  return booking.status === 'confirmed' && booking.startsAtMs <= nowMs
}

export function buildChargeQueue(
  bookings: BoardBooking[],
  courts: ReadonlyArray<{ id: string }>,
  nowMs: number,
): ChargeQueue {
  const courtOrder = new Map(courts.map((c, i) => [c.id, i]))
  // Una cancha que ya no está en la lista (borrada) va al final, no se pierde.
  const courtRank = (b: BoardBooking) => courtOrder.get(b.courtId) ?? courts.length
  const byCourt = (a: BoardBooking, b: BoardBooking) =>
    courtRank(a) - courtRank(b) || a.id.localeCompare(b.id)

  const now: QueueItem[] = []
  const upcoming: BoardBooking[] = []
  let anyStarted = false
  for (const booking of bookings) {
    if (booking.type === 'block') continue
    const started = booking.startsAtMs <= nowMs
    if (started && booking.status !== 'pending_payment') anyStarted = true
    if (isDueNow(booking, nowMs)) {
      now.push({ booking, ended: booking.status === 'completed' || hasEndedAt(booking, nowMs) })
    } else if (
      !started &&
      (booking.status === 'confirmed' || booking.status === 'pending_payment')
    ) {
      upcoming.push(booking)
    }
  }

  now.sort(
    (a, b) =>
      Number(b.ended) - Number(a.ended) ||
      (a.ended ? b.booking.endsAtMs - a.booking.endsAtMs : 0) ||
      byCourt(a.booking, b.booking),
  )
  upcoming.sort((a, b) => a.startsAtMs - b.startsAtMs || byCourt(a, b))
  return { now, upcoming, anyStarted }
}

/** Qué muestra una cancha: el turno para cobrar, el que se juega o el próximo. */
type CourtFocus = { kind: 'due' | 'live' | 'next'; booking: BoardBooking }

export type CourtTile = {
  courtId: string
  /** `null`: no le queda nada hoy. */
  focus: CourtFocus | null
  /** Otros turnos de esta cancha que también hay que cobrar ahora. */
  moreDue: number
}

export type CourtBoard = {
  tiles: CourtTile[]
  /** La cola completa, en el orden en que se cobra ("Siguiente para cobrar"). */
  queue: ChargeQueue
  /** Turnos jugados y no cobrados de hoy, y su plata: lo que va en rojo. */
  lateCount: number
  lateCents: number
}

/**
 * El tablero de Hoy: UNA tarjeta por cancha con UN turno (pedido del dueño,
 * 2026-09-25, sobre la cola de la misma mañana: una lista larga no es una pantalla
 * de acción y con doce canchas no entraba). Cada cancha muestra, en este orden:
 *
 *  1. **due**: el turno que terminó sin cobrarse (el más reciente); los otros de
 *     esa cancha que también hay que cobrar se cuentan en `moreDue`.
 *  2. **live**: el que se está jugando (pagado o no).
 *  3. **next**: el próximo que empieza.
 *
 * Canchas: las que están en servicio, en el orden de la Grilla, más cualquier
 * otra (pausada o borrada) que tenga algo para cobrar: esa plata no se esconde.
 */
export function buildCourtBoard(
  bookings: BoardBooking[],
  courts: ReadonlyArray<{ id: string; status: 'online' | 'offline' }>,
  nowMs: number,
): CourtBoard {
  const queue = buildChargeQueue(bookings, courts, nowMs)
  const late = queue.now.filter((item) => item.ended)

  const courtIds = courts.filter((c) => c.status === 'online').map((c) => c.id)
  for (const { booking } of queue.now) {
    if (!courtIds.includes(booking.courtId)) courtIds.push(booking.courtId)
  }

  const tiles = courtIds.map((courtId): CourtTile => {
    const due = queue.now.filter((item) => item.booking.courtId === courtId)
    const ended = due.find((item) => item.ended)
    if (ended)
      return { courtId, focus: { kind: 'due', booking: ended.booking }, moreDue: due.length - 1 }

    const own = bookings.filter((b) => b.courtId === courtId && b.type !== 'block')
    const live = own.find(
      (b) =>
        b.startsAtMs <= nowMs &&
        !hasEndedAt(b, nowMs) &&
        (b.status === 'confirmed' || b.status === 'completed'),
    )
    if (live)
      return {
        courtId,
        focus: { kind: 'live', booking: live },
        moreDue: due.length - (due.some((d) => d.booking.id === live.id) ? 1 : 0),
      }

    const next = queue.upcoming.find((b) => b.courtId === courtId)
    return { courtId, focus: next ? { kind: 'next', booking: next } : null, moreDue: due.length }
  })

  return {
    tiles,
    queue,
    lateCount: late.length,
    lateCents: late.reduce((sum, item) => sum + (item.booking.pending ?? 0), 0),
  }
}

/**
 * Etiqueta relativa de un turno que no terminó: `'ahora'` si está en juego,
 * `'en 25 min'` si arranca dentro de la hora, `null` si falta más (alcanza con
 * la hora absoluta). Redondea para arriba: a las 19:59:30 de un turno de las
 * 20:00 dice "en 1 min", no "en 0 min".
 */
export function startLabel(
  booking: Pick<BoardBooking, 'startsAtMs' | 'endsAtMs'>,
  nowMs: number,
): string | null {
  if (booking.startsAtMs <= nowMs && nowMs < booking.endsAtMs) return 'ahora'
  const minutes = Math.ceil((booking.startsAtMs - nowMs) / 60_000)
  if (minutes > 0 && minutes <= 60) return `en ${minutes} min`
  return null
}

/**
 * "Terminó hace 4 min" / "Empieza en 25 min" / "En juego": lo que el
 * mostrador necesita saber para decidir, en una línea (`HoyChargeModal`). Sin
 * instantes físicos (fallback de la Grilla, ver `ChargeBooking`) no hay
 * renglón — no se inventa una hora relativa.
 */
export function whenLabel(
  booking: { startsAtMs?: number | null; endsAtMs?: number | null },
  hasEnded: boolean,
  nowMs: number,
): string | null {
  if (typeof booking.startsAtMs !== 'number' || typeof booking.endsAtMs !== 'number') return null
  const startsIn = startLabel({ startsAtMs: booking.startsAtMs, endsAtMs: booking.endsAtMs }, nowMs)
  return hasEnded
    ? `Terminó ${relativeTimeEs(new Date(booking.endsAtMs).toISOString(), nowMs)}`
    : startsIn === 'ahora'
      ? 'En juego'
      : startsIn
}
