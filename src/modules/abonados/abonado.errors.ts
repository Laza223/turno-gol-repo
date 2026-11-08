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

export class PlayerNotClientError extends Error {
  constructor() {
    super('El jugador no es cliente de este complejo.')
    this.name = 'PlayerNotClientError'
  }
}

export class AbonadoNotEditableError extends Error {
  name = 'AbonadoNotEditableError'
  constructor() {
    super('Solo se puede editar un turno fijo activo.')
  }
}

export class AbonadoMoveConflictError extends Error {
  name = 'AbonadoMoveConflictError'
  constructor(
    readonly conflictDates: string[],
    readonly fixedConflict: boolean,
  ) {
    super(
      fixedConflict
        ? 'Ya existe un turno fijo activo en ese horario.'
        : 'Hay fechas que no se pueden usar en el nuevo horario. Liberalas o elegí otro horario.',
    )
  }
}
