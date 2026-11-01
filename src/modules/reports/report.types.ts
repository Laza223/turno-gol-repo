type PaymentMethod = 'cash' | 'transfer' | 'mercadopago' | 'other'

export type CourtReport = {
  courtId: string
  courtName: string
  income: number
  bookingCount: number
  occupancyPct: number
}

export type MethodReport = {
  method: PaymentMethod
  total: number
}

export type PeriodTotals = {
  income: number
  adjustment: number
  balance: number
}

export type RevenueReport = {
  period: { from: Date; to: Date }
  income: number
  adjustment: number
  balance: number
  bookingCount: number
  byCourt: CourtReport[]
  byMethod: MethodReport[]
  prevPeriod: PeriodTotals | null
}

export type WeekRevenue = {
  /** Lo que entró en la semana (centavos): el mismo `income` que Métricas. */
  income: number
  byMethod: MethodReport[]
  /** `income` de los 7 días operativos anteriores, para comparar. */
  prevIncome: number
}

/**
 * Un movimiento de caja para el CSV de Métricas, todavía en datos: los labels,
 * los pesos y el signo los pone `revenue-csv.ts` al armar el archivo.
 */
export type CashFlowExportRow = {
  /** Día OPERATIVO del movimiento, `AAAA-MM-DD`. */
  date: string
  type: 'income' | 'adjustment' | 'expense'
  category: string
  /** Centavos, siempre positivo (`chk_cashflow_amount_positive`): el signo sale de `type`. */
  amount: number
  method: 'cash' | 'transfer' | 'mercadopago' | 'other'
  description: string
  /** `''` si el movimiento no es de un turno. */
  courtName: string
}
