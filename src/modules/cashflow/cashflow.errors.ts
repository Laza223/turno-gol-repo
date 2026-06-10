export class InvalidCashFlowTypeError extends Error {
  constructor() {
    super('Invalid cashflow type. Only income and adjustment are allowed.')
    this.name = 'InvalidCashFlowTypeError'
  }
}

export class InvalidCashFlowCategoryError extends Error {
  constructor(type: string, category: string) {
    super(`Category '${category}' is not valid for type '${type}'.`)
    this.name = 'InvalidCashFlowCategoryError'
  }
}

export class DayAlreadyClosedError extends Error {
  constructor(date: string) {
    super(`Cash register for ${date} has already been closed. Create a new adjustment entry.`)
    this.name = 'DayAlreadyClosedError'
  }
}

export class DayAlreadyCloseExistsError extends Error {
  constructor(date: string) {
    super(`A daily close already exists for ${date}.`)
    this.name = 'DayAlreadyCloseExistsError'
  }
}

export class CloseDateInFutureError extends Error {
  constructor(date: string) {
    super(`Cannot close a future date: ${date}. Only today or past dates can be closed.`)
    this.name = 'CloseDateInFutureError'
  }
}
