export class ReviewBookingNotFoundError extends Error {
  name = 'ReviewBookingNotFoundError'
  constructor(bookingId: string) {
    super(`La reserva ${bookingId} no existe o no es tuya.`)
  }
}

export class ReviewBookingNotCompletedError extends Error {
  name = 'ReviewBookingNotCompletedError'
  constructor() {
    super('Solo podés reseñar un partido que ya jugaste.')
  }
}

export class ReviewAlreadyExistsError extends Error {
  name = 'ReviewAlreadyExistsError'
  constructor() {
    super('Ya dejaste una reseña para esta reserva.')
  }
}
