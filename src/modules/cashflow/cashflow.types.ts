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

/**
 * `CashFlowRow` + el nombre de quién es la contraparte del movimiento (jugador
 * o invitado del turno asociado). Es un tipo de LECTURA para la lista del día
 * (getCashFlows) — NO se agrega a `CashFlowRow` porque `cashFlowResponseSchema`
 * es un `z.strictObject` y `validateApiOutput` (createCashFlowAction) tiraría
 * en runtime con un campo extra que no espera.
 */
export type CashFlowListRow = CashFlowRow & {
  /** Nombre del jugador o invitado del turno asociado; null si el movimiento
   * no tiene bookingId o el jugador no es visible bajo RLS. */
  counterpartName: string | null
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
  /** Neto por método (arqueo): un egreso resta del suyo. Sus partes suman `balance`. */
  byMethod: Partial<Record<CashPaymentMethod, number>>
  /**
   * Lo COBRADO por método: ingresos + ajustes, sin restar egresos. Sus partes
   * suman exactamente `collected`, que es lo que permite mostrarlo como
   * desglose dentro de la card "Cobrado hoy" de /caja/cuentas. `byMethod` no
   * sirve ahí: contesta "cuánto quedó", no "cuánto entró y por dónde".
   */
  collectedByMethod: Partial<Record<CashPaymentMethod, number>>
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
}
