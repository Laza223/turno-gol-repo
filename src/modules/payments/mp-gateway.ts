import type {
  CreatePreapprovalInput,
  CreatePreferenceInput,
  CreateSaasUpgradePreferenceInput,
  GatewayPaymentInfo,
  PreapprovalResult,
  PreferenceResult,
  RefundResult,
} from './payment.types'

/**
 * Abstract gateway. Implementations: MercadoPagoGateway (real), MockGateway (tests).
 *
 * Webhook signature verification is a route-level concern and lives outside
 * this interface (uses MP_WEBHOOK_SECRET HMAC).
 */
export interface PaymentGateway {
  createPreference(input: CreatePreferenceInput): Promise<PreferenceResult>
  getPaymentStatus(mpPaymentId: string): Promise<GatewayPaymentInfo>
  createRefund(mpPaymentId: string, amount?: number, idempotencyKey?: string): Promise<RefundResult>
  searchPaymentsByReference(externalReference: string): Promise<GatewayPaymentInfo[]>

  // ─── SaaS recurring billing (P18) ──────────────────────────────
  createPreapproval(input: CreatePreapprovalInput): Promise<PreapprovalResult>
  cancelPreapproval(preapprovalId: string): Promise<void>
  /** `amount` in centavos ARS. */
  updatePreapprovalAmount(preapprovalId: string, amount: number): Promise<void>
  /**
   * One-off Preference for upgrade proration. external_reference is set to
   * `saas-upgrade:<tenantId>:<targetPlanId>` so the webhook dispatcher can
   * route the resulting payment to `billing.handleUpgradePayment`.
   */
  createSaasUpgradePreference(input: CreateSaasUpgradePreferenceInput): Promise<PreferenceResult>
}
