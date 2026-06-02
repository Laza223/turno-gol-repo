export class OpenMatchBookingNotFoundError extends Error {
  name = 'OpenMatchBookingNotFoundError'
  constructor(bookingId: string) {
    super(`La reserva ${bookingId} no existe o no es tuya.`)
  }
}

export class OpenMatchBookingNotConfirmedError extends Error {
  name = 'OpenMatchBookingNotConfirmedError'
  constructor() {
    super('Solo podés abrir un partido desde una reserva confirmada.')
  }
}

export class OpenMatchAlreadyExistsError extends Error {
  name = 'OpenMatchAlreadyExistsError'
  constructor() {
    super('Esta reserva ya tiene un partido abierto.')
  }
}

export class OpenMatchNotFoundError extends Error {
  name = 'OpenMatchNotFoundError'
  constructor(matchId: string) {
    super(`El partido abierto ${matchId} no existe.`)
  }
}

export class OpenMatchNotOwnerError extends Error {
  name = 'OpenMatchNotOwnerError'
  constructor() {
    super('Solo el creador puede modificar este partido.')
  }
}

export class OpenMatchNotCancelableError extends Error {
  name = 'OpenMatchNotCancelableError'
  constructor() {
    super('El partido no se puede cancelar en su estado actual.')
  }
}

export class OpenMatchCannotJoinOwnError extends Error {
  name = 'OpenMatchCannotJoinOwnError'
  constructor() {
    super('No podés sumarte a tu propio partido.')
  }
}

export class OpenMatchAlreadyJoinedError extends Error {
  name = 'OpenMatchAlreadyJoinedError'
  constructor() {
    super('Ya estás anotado en este partido.')
  }
}

// Cubre los RAISE del trigger enforce_open_match_join (cerrado / completo /
// expirado). El mensaje proviene de la DB (rioplatense, user-facing).
export class OpenMatchNotJoinableError extends Error {
  name = 'OpenMatchNotJoinableError'
  constructor(message: string) {
    super(message)
  }
}
