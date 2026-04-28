export type PreferenceResult = {
  preferenceId: string
  initPoint: string
  sandboxInitPoint: string
}

export type MpPaymentStatus =
  | 'pending'
  | 'in_process'
  | 'approved'
  | 'rejected'
  | 'refunded'
  | 'cancelled'

export type GatewayPaymentInfo = {
  mpPaymentId: string
  status: MpPaymentStatus
  /** Centavos ARS. */
  amount: number
  /** Booking id. */
  externalReference: string
  paymentMethodId: string
}

export type CreatePreferenceInput = {
  bookingId: string
  /** Centavos ARS. */
  amount: number
  description: string
  successUrl: string
  failureUrl: string
  pendingUrl: string
  notificationUrl: string
  /** Booking.created_at + 15min (or 48h for in_process). */
  expiresAt: Date
}

export type RefundResult = {
  mpRefundId: string
  status: 'approved' | 'pending' | 'rejected'
}

export type WebhookEvent = {
  /** Event id from MP — top-level `id` in the IPN body. Idempotency key. */
  mpEventId: string
  /** 'payment' | 'subscription' | 'refund' | ... */
  eventType: string
  /** MP payment id (`data.id` in the body). */
  mpPaymentId: string
  /** Raw body for audit/debugging — stored in `processed_webhooks.payload`. */
  rawPayload: unknown
}

export type WebhookOutcome =
  | { alreadyProcessed: true }
  | { alreadyProcessed: false; result: 'confirmed' | 'in_process' | 'rejected' | 'refunded' }
