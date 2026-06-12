export type CashFlowType = 'income' | 'adjustment' | 'expense'
export type CashFlowCategory =
  | 'booking'
  | 'product_sale'
  | 'other'
  | 'no_show_correction'
  | 'operating_expense'
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
  productId: string | null
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
  diffAmount: number
  note: string | null
  closedBy: string
  closedAt: Date
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

export type CreateCashFlowInput = {
  type: CashFlowType
  category: CashFlowCategory
  amount: number
  method: CashPaymentMethod
  description: string
  bookingId?: string
  productId?: string
  occurredAt?: Date
  /** UUID v4 generado por el cliente al abrir el formulario. Previene duplicados por doble-submit. */
  clientIdempotencyKey?: string
}
