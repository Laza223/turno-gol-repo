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

export class BookingNotOwnedByPlayerError extends Error {
  constructor(bookingId: string, playerId: string) {
    super(`Booking ${bookingId} does not belong to player ${playerId}`)
    this.name = 'BookingNotOwnedByPlayerError'
  }
}
