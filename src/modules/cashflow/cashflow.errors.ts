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

/**
 * La `client_idempotency_key` ya estaba guardada con OTRO movimiento (monto,
 * método, tipo, categoría o entidad). No es un reintento: devolver la fila vieja
 * como si fuera la pedida hace que la pantalla cante un cobro que no entró.
 * `registeredCents` es el monto real ya guardado, para poder reconciliar.
 */
export class CashFlowIdempotencyConflictError extends Error {
  constructor(public readonly registeredCents: number) {
    super(`Idempotency key already used for a different cash flow of ${registeredCents}.`)
    this.name = 'CashFlowIdempotencyConflictError'
  }
}
