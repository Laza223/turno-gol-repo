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
