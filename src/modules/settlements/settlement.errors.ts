export class SettlementValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettlementValidationError'
  }
}

export class SettlementConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettlementConflictError'
  }
}

export class SettlementNotFoundError extends Error {
  constructor(id: string) {
    super(`Acuerdo ${id} no encontrado.`)
    this.name = 'SettlementNotFoundError'
  }
}
