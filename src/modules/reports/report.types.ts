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

export type CashFlowExportRow = {
  fecha: string
  tipo: string
  categoria: string
  monto_ars: number
  metodo: string
  descripcion: string
  cancha: string
}
