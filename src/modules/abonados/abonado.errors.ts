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

export class CourtNotFoundError extends Error {
  name = 'CourtNotFoundError'
  constructor(courtId: string) {
    super(`Cancha ${courtId} no encontrada.`)
  }
}
