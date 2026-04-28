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

export class WebhookSignatureError extends Error {
  constructor() {
    super('Invalid webhook signature')
    this.name = 'WebhookSignatureError'
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
