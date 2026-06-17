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

export class DepositFlowNotImplementedError extends Error {
  constructor() {
    super('Online booking with deposit is not implemented (deferred to P10)')
    this.name = 'DepositFlowNotImplementedError'
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

export class PlayerHasOutstandingBalanceError extends Error {
  constructor(
    public readonly playerId: string,
    public readonly tenantId: string,
    public readonly balance: number,
  ) {
    super(
      `Player ${playerId} has an outstanding balance in tenant ${tenantId}; online booking blocked`,
    )
    this.name = 'PlayerHasOutstandingBalanceError'
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

export class BookingNotYetStartedError extends Error {
  constructor(bookingId: string) {
    super(`Booking ${bookingId} cannot be marked no-show: time_start has not yet passed`)
    this.name = 'BookingNotYetStartedError'
  }
}

export class BookingDateOutOfRangeError extends Error {
  constructor(public readonly reason: 'past_date' | 'past_slot' | 'advance_exceeded') {
    super(`Booking date is out of range: ${reason}`)
    this.name = 'BookingDateOutOfRangeError'
  }
}
