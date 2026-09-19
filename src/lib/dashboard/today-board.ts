/**
 * El tablero "Turnos de hoy" de la pantalla Hoy: qué turno de cada cancha está
 * sin cobrar, en juego o por venir. Función pura — recibe los turnos del día,
 * las canchas y un instante — para que se pueda probar con relojes fijos y
 * recalcular en el cliente cada minuto sin volver al servidor.
 *
 * "Ya terminó" sale de `endsAt`, el instante físico que también valida el
 * servidor, y NO de la hora de pared del turno: `time_end='24:00'` y los slots
 * de madrugada de un complejo `closes_next_day` hacen que comparar strings de
 * hora dé la respuesta equivocada (`slotHasPassed`, operating-day.ts).
 */
import type { GridBooking } from '@/lib/booking/grid-cells'

/** Un turno del día con sus instantes físicos en milisegundos. */
export type BoardBooking = GridBooking & { startsAtMs: number; endsAtMs: number }

export type BoardCourt = {
  id: string
  name: string
  status: 'online' | 'offline'
  /** Jugadores que entran en la cancha (`format × 2`): sin esto no se cuenta "Pagaron 4 de 10". */
  capacity?: number
}

export type BoardRowKind = 'unpaid' | 'live' | 'upcoming'

export type BoardRow = { kind: BoardRowKind; booking: BoardBooking }

export type BoardColumn = {
  courtId: string
  courtName: string
  capacity?: number
  /** Cancha pausada que solo aparece porque le quedó un turno sin cobrar. */
  offline: boolean
  /** Sin cobrar primero (van fijas), después por hora de inicio. */
  rows: BoardRow[]
}

/** ¿El turno ya terminó a `nowMs`? Un turno que termina justo ahora ya terminó. */
export function hasEndedAt(booking: Pick<BoardBooking, 'endsAtMs'>, nowMs: number): boolean {
  return booking.endsAtMs <= nowMs
}

/**
 * En qué bloque del tablero cae el turno, o `null` si no aparece (terminado y
 * pagado, ausente, bloqueo de mantenimiento, cancelado).
 *
 * "Sin cobrar" exige que el turno sea de un cliente: una hora de torneo no se
 * cobra por turno (la plata entra por la inscripción) y un bloqueo no es de nadie.
 */
export function boardRowKind(booking: BoardBooking, nowMs: number): BoardRowKind | null {
  if (booking.type === 'block' || booking.status === 'no_show') return null

  const owes = typeof booking.pending === 'number' && booking.pending > 0
  const isClient = booking.type !== 'tournament'
  const ended = hasEndedAt(booking, nowMs)

  if (
    isClient &&
    owes &&
    (booking.status === 'completed' || (booking.status === 'confirmed' && ended))
  ) {
    return 'unpaid'
  }
  if (ended || booking.status === 'completed') return null

  if (booking.status !== 'confirmed' && booking.status !== 'pending_payment') return null
  return booking.startsAtMs <= nowMs ? 'live' : 'upcoming'
}

const KIND_ORDER: Record<BoardRowKind, number> = { unpaid: 0, live: 1, upcoming: 1 }

/**
 * Una columna por cancha, en el orden en que llegan (el mismo de la Grilla).
 * Las canchas pausadas solo entran si tienen algún turno sin cobrar, y ahí se
 * muestran solo esos: en una cancha pausada no se juega, pero la plata de un
 * turno que ya se jugó sigue siendo plata.
 */
export function buildTodayBoard(
  bookings: BoardBooking[],
  courts: BoardCourt[],
  nowMs: number,
): BoardColumn[] {
  const rowsByCourt = new Map<string, BoardRow[]>()
  for (const booking of bookings) {
    const kind = boardRowKind(booking, nowMs)
    if (!kind) continue
    const list = rowsByCourt.get(booking.courtId)
    if (list) list.push({ kind, booking })
    else rowsByCourt.set(booking.courtId, [{ kind, booking }])
  }

  const columns: BoardColumn[] = []
  for (const court of courts) {
    const all = rowsByCourt.get(court.id) ?? []
    const offline = court.status === 'offline'
    const rows = offline ? all.filter((r) => r.kind === 'unpaid') : all
    if (offline && rows.length === 0) continue
    rows.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.booking.startsAtMs - b.booking.startsAtMs ||
        a.booking.id.localeCompare(b.booking.id),
    )
    columns.push({
      courtId: court.id,
      courtName: court.name,
      ...(court.capacity !== undefined ? { capacity: court.capacity } : {}),
      offline,
      rows,
    })
  }
  return columns
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
