export class AbonadoConflictError extends Error {
  name = 'AbonadoConflictError'
  constructor() {
    super('Ya existe un turno fijo activo en ese horario.')
  }
}

export class AbonadoNotFoundError extends Error {
  name = 'AbonadoNotFoundError'
  constructor(id: string) {
    super(`Abonado ${id} no encontrado.`)
  }
}

export class AbonadoAlreadyCanceledError extends Error {
  name = 'AbonadoAlreadyCanceledError'
  constructor() {
    super('El abonado ya fue cancelado.')
  }
}

export class ReactivationConflictError extends Error {
  name = 'ReactivationConflictError'
  constructor() {
    super('Este horario ya tiene un turno fijo activo. Cancelalo primero.')
  }
}

/** Tarea #4: el saldo a favor del abonado no alcanza para descontar la sesión. */
export class InsufficientCreditError extends Error {
  name = 'InsufficientCreditError'
  constructor() {
    super('El saldo a favor del abonado no alcanza para descontar esta sesión.')
  }
}

/**
 * Tarea #4: el turno no admite descuento de saldo (no es un turno fijo de
 * abonado, o no está en estado confirmado).
 */
export class CreditNotApplicableError extends Error {
  name = 'CreditNotApplicableError'
  constructor() {
    super('Este turno no admite descuento del saldo de abonado.')
  }
}
