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
  // Inscripción a un torneo (migr. 066). Solo como ingreso y SIEMPRE con
  // tournamentTeamId: el CHECK de DB lo hace bidireccional.
  | 'tournament'
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
  /** Migr. 066. Equipo del cobro de inscripción; null en todo lo demás. */
  tournamentTeamId: string | null
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
  /**
   * B14 — lo COBRADO en el día: ingresos + ajustes, sin restar egresos. Es el
   * número que el complejo llama "lo de hoy", y el que muestran `/caja`, la
   * pantalla "Hoy" y el sidebar.
   *
   * Existe como campo (y no como una suma en cada pantalla) porque el criterio
   * de salida de Fase 1 pide **fuente única de agregados**: el mismo número en
   * toda superficie que lo muestre, verificado con test de consistencia y no a
   * ojo. Antes de B14 la suma estaba escrita a mano en dos lugares, y el
   * sidebar iba a ser el tercero.
   *
   * NO confundir con `balance`: ese resta los egresos y contesta otra pregunta
   * ("cuánto queda"), no "cuánto entró".
   */
  collected: number
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
  /**
   * Migr. 066. Obligatorio con category 'tournament' y prohibido sin ella.
   * NO lo expone la Server Action genérica de Caja: el único camino es
   * registerInscriptionPayment, igual que bookingId con addBookingChargeAction.
   */
  tournamentTeamId?: string
  occurredAt?: Date
  /** UUID v4 generado por el cliente al abrir el formulario. Previene duplicados por doble-submit. */
  clientIdempotencyKey?: string
  /**
   * Escribe aunque la caja de ese día operativo ya esté cerrada. Es el camino
   * que el propio diálogo de cierre promete ("las correcciones posteriores van
   * como ajustes"), así que SOLO vale con `type: 'adjustment'` — con cualquier
   * otro tipo `createCashFlow` tira `AdjustmentRequiredForClosedDayError`.
   *
   * Único caller: la seña que el staff cobra de mostrador después de haber
   * cerrado la caja. Antes eso quedaba fuera de Caja para siempre: la reserva
   * decía "pagada" y la plata no figuraba en ningún lado (🔴 QA 2026-08-28
   * F-02). No lo expone ninguna Server Action: abrirlo a la UI genérica
   * convertiría el cierre en una sugerencia.
   *
   * El snapshot del cierre (`expected_cash`, `diff_amount`) NO se toca: queda
   * como la foto de lo que se contó, y el ajuste se ve aparte.
   */
  allowClosedDay?: boolean
}
