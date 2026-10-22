export class PaymentNotFoundError extends Error {
  constructor(paymentId: string) {
    super(`Payment ${paymentId} not found`)
    this.name = 'PaymentNotFoundError'
  }
}

export class BookingNotPendingPaymentError extends Error {
  constructor(bookingId: string) {
    super(`Booking ${bookingId} is not in 'pending_payment' status`)
    this.name = 'BookingNotPendingPaymentError'
  }
}

export class MpGatewayError extends Error {
  override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'MpGatewayError'
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * MercadoPago rechazó el refresh porque el permiso OAuth del complejo ya no
 * existe: `invalid_grant` (refresh revocado, vencido o de otra aplicación) o
 * `unauthorized_client` (la aplicación no tiene grant con ese usuario).
 *
 * Es la ÚNICA señal que marca al complejo como desconectado
 * (`mp-connection.service.ts`). `invalid_client`, un 5xx o un timeout son
 * problemas de TurnoGol o de MP, no del complejo, y siguen siendo
 * `MpGatewayError` a secas: avisarle "reconectá" ahí sería mentirle.
 */
export class MpGrantRevokedError extends MpGatewayError {
  constructor(
    readonly mpError: 'invalid_grant' | 'unauthorized_client',
    status: number,
  ) {
    super(`MP token refresh failed (HTTP ${status}, ${mpError})`)
    this.name = 'MpGrantRevokedError'
  }
}

export class TenantMpNotConnectedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} has no MercadoPago account connected`)
    this.name = 'TenantMpNotConnectedError'
  }
}

export class RefundInvalidStateError extends Error {
  constructor(paymentId: string, state: string) {
    super(`Cannot refund payment ${paymentId}: status is '${state}'`)
    this.name = 'RefundInvalidStateError'
  }
}

export class RefundAmountExceedsOriginalError extends Error {
  constructor(paymentId: string, requested: number, available: number) {
    super(
      `Refund amount ${requested} exceeds available amount ${available} for payment ${paymentId} (original minus prior refunds)`,
    )
    this.name = 'RefundAmountExceedsOriginalError'
  }
}
