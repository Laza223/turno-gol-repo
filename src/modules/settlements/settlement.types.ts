export type SettlementKind = 'pack' | 'monthly' | 'bookings'
export type SettlementPaymentOrigin = 'caja' | 'already_settled'
export type AbonadoBillingMode = 'per_session' | 'monthly' | 'pack'

export type SettlementRow = {
  id: string
  tenantId: string
  abonadoId: string | null
  courtId: string | null
  kind: SettlementKind
  paymentOrigin: SettlementPaymentOrigin
  amount: number
  creditsTotal: number | null
  periodStart: string | null
  periodEnd: string | null
  createdByStaff: string
  voidedAt: Date | null
  voidedByStaff: string | null
  createdAt: Date
}

export type SettlementChargeLine = {
  amount: number
  method: 'cash' | 'transfer' | 'mercadopago' | 'other'
}

export type SettleAbonadoPeriodInput = {
  abonadoId: string
  kind: 'pack' | 'monthly'
  paymentOrigin: SettlementPaymentOrigin
  /** Monto real en centavos (obligatorio > 0 si paymentOrigin === 'caja'; 0 permitido en 'already_settled'). */
  amount: number
  /** Requerido cuando kind === 'pack'. Default en UI = 4. */
  creditsTotal?: number
  /** Mes calendario `YYYY-MM` cuando kind === 'monthly'. */
  month?: string
  /** Fecha opcional dentro del mes para acotar `period_start`. */
  startsFromDate?: string
  /** Desglose de medios de pago cuando paymentOrigin === 'caja'. */
  charges?: SettlementChargeLine[]
  clientIdempotencyKey?: string
}

export type SettleBookingsBatchInput = {
  bookingIds: string[]
  paymentOrigin: SettlementPaymentOrigin
  amount: number
  charges?: SettlementChargeLine[]
  clientIdempotencyKey?: string
}

export type SettlementOutcome = {
  settlement: SettlementRow
  coveredBookingIds: string[]
}

export type AbonadoCoverageSummary = {
  abonadoId: string
  billingMode: AbonadoBillingMode
  agreedAmount: number
  /** Meses calendario (`YYYY-MM`) cubiertos por acuerdos mensuales vigentes. */
  coveredMonths: string[]
  /** Créditos pagados/saldados aún sin haberse jugado ni marcado ausentes. */
  remainingPackSessions: number
  /** Suma de `credits_total` de packs que todavía tienen turnos por jugar. */
  activePackTotalCredits: number
  /** Cantidad de sesiones futuras confirmadas ya cubiertas. */
  coveredUpcomingCount: number
}

type AbonadoBillingOverview = {
  abonadoId: string
  contactName: string
  contactPhone: string | null
  pricePerSession: number
  billingMode: AbonadoBillingMode
  agreedAmount: number
  coverage: AbonadoCoverageSummary
}

export type SettlementActionResult =
  | { success: true; settlement: SettlementRow; coveredBookingIds: string[] }
  | { success: false; error: string }

export type UpdateAbonadoAgreementResult =
  { success: true; updatedBookings: number } | { success: false; error: string }

export type AbonadoBillingOverviewResult =
  { success: true; overview: AbonadoBillingOverview } | { success: false; error: string }
