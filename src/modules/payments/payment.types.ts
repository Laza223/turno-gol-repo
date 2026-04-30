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

// ─── SaaS recurring billing (P18) ──────────────────────────────

export type CreatePreapprovalInput = {
  /** TurnoGol tenant id; goes into MP `external_reference`. */
  tenantId: string
  payerEmail: string
  /** Centavos ARS. */
  amount: number
  frequency: 'monthly' | 'annual'
  /** Plan id (for audit trail; not required by MP). */
  planId: string
  /** Free-text shown to payer in the MP UI. */
  reason: string
  returnUrl: string
  /** MP webhook URL (`/api/webhooks/mercadopago?tenant=<id>`). */
  notificationUrl: string
}

export type PreapprovalResult = {
  preapprovalId: string
  initPoint: string
}

export type CreateSaasUpgradePreferenceInput = {
  tenantId: string
  targetPlanId: string
  /** Centavos ARS — the proration charge. */
  amount: number
  description: string
  returnUrl: string
  notificationUrl: string
  expiresAt: Date
}

/**
 * external_reference format for upgrade preferences:
 *   `saas-upgrade:<tenantId>:<targetPlanId>`
 * Used by the MP webhook dispatcher to route the resulting payment back to
 * `billing.handleUpgradePayment`.
 */
export const SAAS_UPGRADE_REF_PREFIX = 'saas-upgrade:'

export function buildSaasUpgradeRef(tenantId: string, targetPlanId: string): string {
  return `${SAAS_UPGRADE_REF_PREFIX}${tenantId}:${targetPlanId}`
}

export function parseSaasUpgradeRef(
  externalReference: string,
): { tenantId: string; targetPlanId: string } | null {
  if (!externalReference.startsWith(SAAS_UPGRADE_REF_PREFIX)) return null
  const [, tenantId, targetPlanId] = externalReference.split(':')
  if (!tenantId || !targetPlanId) return null
  return { tenantId, targetPlanId }
}
