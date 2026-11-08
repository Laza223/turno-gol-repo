export class AbonadoConflictError extends Error {
  name = 'AbonadoConflictError'
  constructor() {
    super('Ya existe un turno fijo activo en ese horario.')
  }
}

export class AbonadoNotFoundError extends Error {
  name = 'AbonadoNotFoundError'
  constructor(public readonly abonadoId: string) {
    super('No encontramos ese turno fijo.')
  }
}

export class AbonadoAlreadyCanceledError extends Error {
  name = 'AbonadoAlreadyCanceledError'
  constructor() {
    super('Ese turno fijo ya estaba cancelado.')
  }
}

export class ReactivationConflictError extends Error {
  name = 'ReactivationConflictError'
  constructor() {
    super('Ese horario ya tiene un turno fijo activo. Cancelalo antes de reactivar este.')
  }
}

export class CourtNotFoundError extends Error {
  name = 'CourtNotFoundError'
  constructor(public readonly courtId: string) {
    super('No encontramos esa cancha.')
  }
}

export class PlayerNotClientError extends Error {
  constructor() {
    super('El jugador no es cliente de este complejo.')
    this.name = 'PlayerNotClientError'
  }
}
