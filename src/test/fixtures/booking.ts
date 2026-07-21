import type { GridBooking } from '@/lib/booking/grid-cells'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { artDateString, daysFromNow, hoursFromNow, minutesFromNow } from './clock'
import { courtFutbol5, courtFutbol7, courtFutbol11 } from './court'
import { uid } from './ids'
import { player, playerAlt, type PlayerRow } from './player'
import { staffManager, staffMember } from './staff'
import { tenant, tenantClosesNextDay } from './tenant'

/** Fecha operativa (sin hora) a N días de FROZEN_NOW, en la timezone del complejo. */
const dateAt = (offsetDays: number): Date => new Date(`${artDateString(daysFromNow(offsetDays))}T00:00:00.000Z`)

/**
 * Default: turno de hoy a la tarde, confirmado, con seña pagada por MercadoPago
 * y jugador registrado. La base para el resto de las variantes de status.
 */
export const booking = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  id: uid(1001),
  tenantId: tenant().id,
  courtId: courtFutbol5().id,
  playerId: player().id,
  abonadoId: null,
  createdByStaff: null,
  completedByStaff: null,
  date: dateAt(0),
  timeStart: '16:00',
  timeEnd: '17:00',
  type: 'spontaneous',
  status: 'confirmed',
  priceSnapshot: 1500000,
  depositAmount: 450000,
  depositStatus: 'paid',
  paymentMethod: 'mercadopago',
  paymentId: uid(9001),
  notesInternal: null,
  notesPlayer: null,
  guestName: null,
  guestPhone: null,
  canceledReason: null,
  canceledBy: null,
  canceledAt: null,
  createdAt: hoursFromNow(-26),
  updatedAt: hoursFromNow(-26),
  ...overrides,
})

/**
 * Adapta un `BookingRow` (fixture "completo", shape de la tabla) al `GridBooking`
 * acotado que consumen BookingGrid/BookingCard/BookingPopover — el mismo shape
 * que arma el JOIN con `players` en grilla/page.tsx (nombre plano, sin objeto
 * jugador, `date` como string). Pasá el fixture de jugador correspondiente
 * (`player()`/`playerAlt()`) cuando `playerId` no sea null; se omite para guests
 * y bloqueos.
 */
export const toGridBooking = (
  row: BookingRow,
  playerRow?: Pick<PlayerRow, 'firstName' | 'lastName'> | null,
): GridBooking => ({
  id: row.id,
  courtId: row.courtId,
  date: artDateString(row.date),
  timeStart: row.timeStart,
  timeEnd: row.timeEnd,
  status: row.status,
  type: row.type,
  guestName: row.guestName,
  playerFirstName: playerRow?.firstName ?? null,
  playerLastName: playerRow?.lastName ?? null,
  priceSnapshot: row.priceSnapshot,
  paymentMethod: row.paymentMethod,
  depositStatus: row.depositStatus,
  depositAmount: row.depositAmount,
})

// ─── Una variante por cada BookingStatus ───────────────────────────────────

/** Hold reciente sin pagar todavía — el watcher sigue haciendo polling (dentro del TTL de 15min). */
export const bookingPendingPayment = (): BookingRow =>
  booking({
    id: uid(1002),
    playerId: playerAlt().id,
    timeStart: '19:00',
    timeEnd: '20:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    paymentMethod: null,
    paymentId: null,
    createdAt: minutesFromNow(-6),
    updatedAt: minutesFromNow(-6),
  })

/** Confirmado sin seña (complejo con `requires_deposit: false` o pago 100% en efectivo). */
export const bookingConfirmedNoDeposit = (): BookingRow =>
  booking({
    id: uid(1003),
    courtId: courtFutbol7().id,
    playerId: playerAlt().id,
    timeStart: '10:00',
    timeEnd: '11:00',
    status: 'confirmed',
    depositAmount: 0,
    depositStatus: 'not_required',
    paymentMethod: 'cash',
    paymentId: null,
    createdAt: daysFromNow(-1),
    updatedAt: daysFromNow(-1),
  })

/** Hold que venció sin que el jugador completara el pago (nunca ocupó el turno). */
export const bookingExpired = (): BookingRow =>
  booking({
    id: uid(1004),
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'expired',
    depositStatus: 'pending',
    paymentMethod: null,
    paymentId: null,
    createdAt: hoursFromNow(-3),
    updatedAt: hoursFromNow(-3),
  })

/** Turno de ayer, jugado sin novedades — seña capturada como parte del pago total. */
export const bookingCompleted = (): BookingRow =>
  booking({
    id: uid(1005),
    courtId: courtFutbol11().id,
    date: dateAt(-1),
    timeStart: '11:00',
    timeEnd: '12:00',
    status: 'completed',
    priceSnapshot: 1800000,
    depositAmount: 540000,
    depositStatus: 'captured',
    createdAt: daysFromNow(-2),
    updatedAt: hoursFromNow(-20),
  })

/** No se presentó — la seña se capturó (único costo real, sin deuda). */
export const bookingNoShow = (): BookingRow =>
  booking({
    id: uid(1006),
    date: dateAt(-2),
    timeStart: '20:00',
    timeEnd: '21:00',
    status: 'no_show',
    depositStatus: 'captured',
    createdAt: daysFromNow(-3),
    updatedAt: daysFromNow(-2),
  })

/** Cancelado por el jugador con anticipación suficiente — seña devuelta. */
export const bookingCanceledRefunded = (): BookingRow =>
  booking({
    id: uid(1007),
    date: dateAt(1),
    timeStart: '18:00',
    timeEnd: '19:00',
    status: 'canceled_refunded',
    depositStatus: 'refunded',
    canceledReason: 'Cancelado por el jugador con más de 12hs de anticipación.',
    canceledBy: 'player',
    canceledAt: hoursFromNow(-20),
    createdAt: daysFromNow(-4),
    updatedAt: hoursFromNow(-20),
  })

/** Cancelado fuera de la ventana de reembolso — el complejo retiene la seña. */
export const bookingCanceledNoRefund = (): BookingRow =>
  booking({
    id: uid(1008),
    timeStart: '17:00',
    timeEnd: '18:00',
    status: 'canceled_no_refund',
    depositStatus: 'captured',
    canceledReason: 'Cancelado a 2hs del turno, fuera de la ventana de reembolso.',
    canceledBy: 'player',
    canceledAt: hoursFromNow(-2),
    createdAt: daysFromNow(-1),
    updatedAt: hoursFromNow(-2),
  })

// ─── Otras variantes útiles ─────────────────────────────────────────────────

/** Walk-in cargado por el encargado en el mostrador: sin jugador registrado, guest. */
export const bookingGuest = (): BookingRow =>
  booking({
    id: uid(1009),
    courtId: courtFutbol7().id,
    playerId: null,
    createdByStaff: staffManager().id,
    timeStart: '13:00',
    timeEnd: '14:00',
    depositAmount: 0,
    depositStatus: 'not_required',
    paymentMethod: 'cash',
    paymentId: null,
    guestName: 'Fernando Bianchi',
    guestPhone: '+54 9 11 4444-5555',
    createdAt: hoursFromNow(-1),
    updatedAt: hoursFromNow(-1),
  })

/** Nombre de guest largo real, para ejercitar el wrap de la tarjeta/celda de grilla. */
export const bookingGuestLongName = (): BookingRow =>
  booking({
    id: uid(1010),
    courtId: courtFutbol11().id,
    playerId: null,
    createdByStaff: staffMember().id,
    timeStart: '22:00',
    timeEnd: '23:00',
    priceSnapshot: 1800000,
    depositAmount: 540000,
    guestName: 'Sebastián Maximiliano Villalba Etcheverry',
    guestPhone: '+54 9 11 6677-8899',
    notesPlayer: 'Cumpleaños de 30 — van a ser 14, avisaron que llegan un rato antes.',
    createdAt: daysFromNow(-1),
    updatedAt: daysFromNow(-1),
  })

/** Bloqueo administrativo (mantenimiento) — nunca aparece como reservable. */
export const bookingBlock = (): BookingRow =>
  booking({
    id: uid(1011),
    type: 'block',
    playerId: null,
    createdByStaff: staffMember().id,
    timeStart: '09:00',
    timeEnd: '10:00',
    priceSnapshot: 0,
    depositAmount: 0,
    depositStatus: 'not_required',
    paymentMethod: null,
    paymentId: null,
    notesInternal: 'Cancha reservada para cambio de red y pintado de líneas.',
    createdAt: daysFromNow(-2),
    updatedAt: daysFromNow(-2),
  })

/** Turno fijo semanal ligado a un abonado (ver abonado.ts, misma cancha/horario). */
export const bookingFixed = (): BookingRow =>
  booking({
    id: uid(1012),
    type: 'fixed',
    playerId: playerAlt().id,
    abonadoId: uid(501),
    timeStart: '20:00',
    timeEnd: '21:00',
    depositAmount: 0,
    depositStatus: 'not_required',
    paymentMethod: 'cash',
    paymentId: null,
    createdAt: daysFromNow(-90),
    updatedAt: daysFromNow(-7),
  })

/**
 * Slot 23:00→00:00 en un complejo `closes_next_day`: se persiste con
 * `time_end = '24:00'` (madrugada del día operativo, no del día calendario
 * siguiente). Ver src/shared/time/operating-day.ts.
 */
export const bookingMidnightSlot = (): BookingRow =>
  booking({
    id: uid(1013),
    tenantId: tenantClosesNextDay().id,
    timeStart: '23:00',
    timeEnd: '24:00',
    createdAt: daysFromNow(-1),
    updatedAt: daysFromNow(-1),
  })

/** Una reserva de cada status + las variantes de guest/bloqueo/turno fijo/madrugada. */
export const bookings = (): BookingRow[] => [
  booking(),
  bookingPendingPayment(),
  bookingConfirmedNoDeposit(),
  bookingExpired(),
  bookingCompleted(),
  bookingNoShow(),
  bookingCanceledRefunded(),
  bookingCanceledNoRefund(),
  bookingGuest(),
  bookingGuestLongName(),
  bookingBlock(),
  bookingFixed(),
  bookingMidnightSlot(),
]

// ─── Grilla de sábado a la tarde, llena ────────────────────────────────────

/**
 * Sábado (FROZEN_NOW = 14-mar-2026, 15:30 ART) de 14:00 a 20:00, las 3 canchas
 * online completas: sin huecos libres. Mezcla de status realista para esa
 * hora (14-15 ya jugado, 15-16 en curso, el resto reservado a futuro) y de
 * jugador registrado vs. guest walk-in.
 */
export const saturdayAfternoonGrid = (): BookingRow[] => {
  const f5 = courtFutbol5().id
  const f7 = courtFutbol7().id
  const f11 = courtFutbol11().id
  const staffId = staffManager().id

  return [
    // Cancha 1 (Fútbol 5) — pricing sábado 1.500.000 / seña 450.000
    booking({ id: uid(1101), courtId: f5, timeStart: '14:00', timeEnd: '15:00', status: 'completed', depositStatus: 'captured', playerId: player().id }),
    booking({ id: uid(1102), courtId: f5, timeStart: '15:00', timeEnd: '16:00', status: 'confirmed', playerId: playerAlt().id }),
    booking({ id: uid(1103), courtId: f5, timeStart: '16:00', timeEnd: '17:00', status: 'confirmed', playerId: null, createdByStaff: staffId, depositAmount: 0, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Grupo Los Pibes de Once' }),
    booking({ id: uid(1104), courtId: f5, timeStart: '17:00', timeEnd: '18:00', status: 'pending_payment', playerId: null, depositStatus: 'pending', paymentMethod: null, paymentId: null, createdAt: minutesFromNow(-4), updatedAt: minutesFromNow(-4), guestName: null }),
    booking({ id: uid(1105), courtId: f5, timeStart: '18:00', timeEnd: '19:00', status: 'confirmed', playerId: null, createdByStaff: staffId, depositAmount: 0, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Nicolás Paredes' }),
    booking({ id: uid(1106), courtId: f5, timeStart: '19:00', timeEnd: '20:00', status: 'confirmed', playerId: null, createdByStaff: staffId, depositAmount: 0, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Franco Bustamante' }),

    // Cancha 2 (Fútbol 7) — pricing sábado 1.500.000 / seña 450.000
    booking({ id: uid(1107), courtId: f7, timeStart: '14:00', timeEnd: '15:00', status: 'completed', depositStatus: 'captured', playerId: null, createdByStaff: staffId, guestName: 'Equipo Contadores SRL' }),
    booking({ id: uid(1108), courtId: f7, timeStart: '15:00', timeEnd: '16:00', status: 'confirmed', playerId: null, createdByStaff: staffId, depositAmount: 0, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Matías Colodrero' }),
    booking({ id: uid(1109), courtId: f7, timeStart: '16:00', timeEnd: '17:00', status: 'confirmed', playerId: player().id }),
    booking({ id: uid(1110), courtId: f7, timeStart: '17:00', timeEnd: '18:00', status: 'confirmed', playerId: null, createdByStaff: staffId, depositAmount: 0, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Los Amigos del Barrio Once' }),
    booking({ id: uid(1111), courtId: f7, timeStart: '18:00', timeEnd: '19:00', status: 'confirmed', playerId: playerAlt().id }),
    booking({ id: uid(1112), courtId: f7, timeStart: '19:00', timeEnd: '20:00', status: 'confirmed', playerId: null, createdByStaff: staffId, depositAmount: 0, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Cumpleaños de Valentina — 15 amigas' }),

    // Cancha 3 (Fútbol 11, aire libre) — pricing flat 1.800.000 / seña 540.000
    booking({ id: uid(1113), courtId: f11, timeStart: '14:00', timeEnd: '15:00', status: 'no_show', depositStatus: 'captured', playerId: null, guestName: 'Grupo Corporativo Alvear' }),
    booking({ id: uid(1114), courtId: f11, timeStart: '15:00', timeEnd: '16:00', status: 'confirmed', priceSnapshot: 1800000, depositAmount: 540000, playerId: player().id }),
    booking({ id: uid(1115), courtId: f11, timeStart: '16:00', timeEnd: '17:00', status: 'confirmed', priceSnapshot: 1800000, depositAmount: 540000, playerId: null, createdByStaff: staffId, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Torneo Interbarrial — Semifinal' }),
    booking({ id: uid(1116), courtId: f11, timeStart: '17:00', timeEnd: '18:00', status: 'confirmed', priceSnapshot: 1800000, depositAmount: 540000, playerId: playerAlt().id }),
    booking({ id: uid(1117), courtId: f11, timeStart: '18:00', timeEnd: '19:00', status: 'confirmed', priceSnapshot: 1800000, depositAmount: 540000, playerId: null, createdByStaff: staffId, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Damián Echeverría' }),
    booking({ id: uid(1118), courtId: f11, timeStart: '19:00', timeEnd: '20:00', status: 'confirmed', priceSnapshot: 1800000, depositAmount: 540000, playerId: null, createdByStaff: staffId, depositStatus: 'not_required', paymentMethod: 'cash', paymentId: null, guestName: 'Selección de Ex-alumnos — Promoción 2016' }),
  ]
}

/**
 * `saturdayAfternoonGrid()` ya adaptado a `GridBooking[]` (BookingGrid/GridScroller
 * consumen ese shape, no `BookingRow[]`). Resuelve nombre/apellido para las
 * reservas con `playerId` de `player()`/`playerAlt()`.
 */
export const saturdayAfternoonGridBookings = (): GridBooking[] => {
  const byPlayerId = new Map([
    [player().id, player()],
    [playerAlt().id, playerAlt()],
  ])
  return saturdayAfternoonGrid().map((row) =>
    toGridBooking(row, row.playerId ? byPlayerId.get(row.playerId) : null),
  )
}
