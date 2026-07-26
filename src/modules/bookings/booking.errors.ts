export class CourtOfflineError extends Error {
  constructor(courtId: string) {
    super(`Court ${courtId} is not online`)
    this.name = 'CourtOfflineError'
  }
}

export class SlotTakenError extends Error {
  constructor() {
    super('Slot is already taken')
    this.name = 'SlotTakenError'
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string, reason?: string) {
    super(`Invalid transition: ${from} -> ${to}${reason ? ` (${reason})` : ''}`)
    this.name = 'InvalidTransitionError'
  }
}

export class BookingNotInConfirmedError extends Error {
  constructor(bookingId: string) {
    super(`Booking ${bookingId} is not in 'confirmed' status`)
    this.name = 'BookingNotInConfirmedError'
  }
}

export class PriceUnavailableError extends Error {
  constructor() {
    super('Price could not be calculated for this slot')
    this.name = 'PriceUnavailableError'
  }
}

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookingValidationError'
  }
}

export class PlayerBannedError extends Error {
  constructor(
    public readonly playerId: string,
    public readonly tenantId: string,
    public readonly bannedGlobal: boolean = false,
    public readonly reason?: string,
    public readonly until?: Date | null,
  ) {
    super(`Player ${playerId} is banned in tenant ${tenantId}`)
    this.name = 'PlayerBannedError'
  }
}

export class BookingNotOwnedByPlayerError extends Error {
  constructor(bookingId: string, playerId: string) {
    super(`Booking ${bookingId} does not belong to player ${playerId}`)
    this.name = 'BookingNotOwnedByPlayerError'
  }
}

export class TenantInactiveError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly status: string,
  ) {
    super(`Tenant ${tenantId} is '${status}'; cancellation not allowed`)
    this.name = 'TenantInactiveError'
  }
}

// Hallazgo 2: una cancelación in-policy con seña MP pagada (payment_id seteado)
// no puede ejecutar el refund porque el gateway no está disponible. Lanzamos en
// vez de marcar canceled_refunded con deposit_status='paid' (estado mentiroso:
// la plata quedaría en MP sin devolverse y sin payment row de refund).
export class RefundUnavailableError extends Error {
  constructor(public readonly bookingId: string) {
    super(
      `Booking ${bookingId} cannot be refunded: payment gateway is unavailable`,
    )
    this.name = 'RefundUnavailableError'
  }
}

export class BookingNotYetEndedError extends Error {
  constructor(bookingId: string) {
    super(`Booking ${bookingId} cannot be completed: time_end has not yet passed`)
    this.name = 'BookingNotYetEndedError'
  }
}

// RI #5 (fase D4, doc6 §3): marcar no-show exige que el turno haya TERMINADO
// (ends_at pasado), no solo que haya empezado — con el equipo todavía en
// cancha (hasta 59 min de ventana) el softban/captura de seña era prematuro.
// Reemplaza a la vieja `BookingNotYetStartedError` (condición basada en
// starts_at), alineando el código al spec.
export class NoShowNotYetEndedError extends Error {
  constructor(bookingId: string) {
    super(`Booking ${bookingId} cannot be marked no-show: time_end has not yet passed`)
    this.name = 'NoShowNotYetEndedError'
  }
}

// P5: la corrección completed → no_show sólo se admite dentro de las 24h
// posteriores a la completación (bookings.updated_at). Pasada la ventana, el
// turno queda inmutable y la corrección debe resolverse por otra vía.
export class NoShowCorrectionWindowExpiredError extends Error {
  constructor(public readonly bookingId: string) {
    super(
      `Booking ${bookingId} cannot be corrected to no_show: the 24h window since completion has passed`,
    )
    this.name = 'NoShowCorrectionWindowExpiredError'
  }
}

// RI #1: la reserva que se intenta devolver a 'completed' no está en 'no_show'
// (ya se corrigió, nunca se marcó ausente, o el id no existe).
export class BookingNotInNoShowError extends Error {
  constructor(public readonly bookingId: string) {
    super(`Booking ${bookingId} is not in 'no_show' status`)
    this.name = 'BookingNotInNoShowError'
  }
}

// RI #1: la corrección inversa no_show → completed sólo se admite dentro de las
// 24h posteriores a la marca de ausencia (bookings.updated_at). Pasada la
// ventana el turno queda inmutable (espejo de NoShowCorrectionWindowExpiredError).
export class NoShowRevertWindowExpiredError extends Error {
  constructor(public readonly bookingId: string) {
    super(
      `Booking ${bookingId} cannot be reverted to completed: the 24h window since the no-show has passed`,
    )
    this.name = 'NoShowRevertWindowExpiredError'
  }
}

export class BookingDateOutOfRangeError extends Error {
  constructor(public readonly reason: 'past_date' | 'past_slot' | 'advance_exceeded') {
    super(`Booking date is out of range: ${reason}`)
    this.name = 'BookingDateOutOfRangeError'
  }
}

// INV-ABUSE-001: tope duro de holds (pending_payment) simultáneos sin pagar
// por jugador+tenant — defensa de Denial-of-Inventory del portal público.
export class TooManyActiveHoldsError extends Error {
  constructor(
    public readonly playerId: string,
    public readonly tenantId: string,
    public readonly activeCount: number,
  ) {
    super(
      `Player ${playerId} already has ${activeCount} active pending_payment holds in tenant ${tenantId}`,
    )
    this.name = 'TooManyActiveHoldsError'
  }
}
