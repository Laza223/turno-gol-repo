export type CashFlowType = 'income' | 'adjustment' | 'expense'
export type CashFlowCategory =
  | 'booking'
  | 'product_sale'
  | 'other'
  | 'no_show_correction'
  // Gastos (migr. 050). 'operating_expense' queda como legacy válido (filas
  // históricas); la UI nueva solo ofrece las 5 categorías específicas.
  | 'operating_expense'
  | 'merchandise'
  | 'salaries'
  | 'utilities'
  | 'maintenance'
  | 'other_expense'
export type CashPaymentMethod = 'cash' | 'transfer' | 'mercadopago' | 'other'

export type CashFlowRow = {
  id: string
  tenantId: string
  type: CashFlowType
  category: CashFlowCategory
  amount: number
  method: CashPaymentMethod
  description: string
  bookingId: string | null
  registeredBy: string
  occurredAt: Date
  createdAt: Date
}

export type DailyCashCloseRow = {
  id: string
  tenantId: string
  date: Date
  totalIncome: number
  totalAdjustments: number
  totalExpense: number
  balance: number
  declaredCash: number
  /**
   * Cierres nuevos (migr. 049): declared − expected. Cierres legacy
   * (expectedCash null): balance − declared. NUNCA mezclar las fórmulas.
   */
  diffAmount: number
  /** Fondo inicial snapshoteado al cerrar; null = cierre legacy pre-049. */
  openingCash: number | null
  /** opening + neto cash del día; null = cierre legacy pre-049. */
  expectedCash: number | null
  note: string | null
  closedBy: string
  closedAt: Date
}

export type DailyCashOpenRow = {
  id: string
  tenantId: string
  date: Date
  /** Centavos ARS. Fondo inicial en efectivo del día. */
  openingCash: number
  note: string | null
  openedBy: string
  openedAt: Date
  updatedAt: Date
}

export type DaySummary = {
  date: string
  totalIncome: number
  totalAdjustments: number
  totalExpense: number
  /** Saldo neto del día: ingresos + ajustes - egresos. */
  balance: number
  byCategory: Partial<Record<CashFlowCategory, number>>
  byMethod: Partial<Record<CashPaymentMethod, number>>
  isClosed: boolean
  close: DailyCashCloseRow | null
}

/** Totales de un día para comparativas. Ingresos incluye ajustes (todo lo que suma). */
export type DayTotals = {
  totalIncome: number
  totalExpense: number
  balance: number
}

export type DayComparisons = {
  /** Totales del día anterior (0s si no hubo movimientos). */
  yesterday: DayTotals
  /** Promedio diario de los 7 días anteriores; días sin movimientos cuentan como 0. */
  weekAvg: DayTotals
}

export type CreateCashFlowInput = {
  type: CashFlowType
  category: CashFlowCategory
  amount: number
  method: CashPaymentMethod
  description: string
  bookingId?: string
  occurredAt?: Date
  /** UUID v4 generado por el cliente al abrir el formulario. Previene duplicados por doble-submit. */
  clientIdempotencyKey?: string
}
