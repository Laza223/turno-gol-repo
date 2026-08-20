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
  /**
   * De qué complejo es un evento de suscripción, leído de MercadoPago.
   *
   * Existe porque **MP no guarda `notification_url` en un preapproval**
   * (verificado en producción el 2026-08-20: el `PUT` responde 200 y el campo
   * sigue vacío). Las notificaciones de suscripción llegan por el canal global
   * del panel, sin el `?tenant=` que TurnoGol pone por operación en las
   * preferencias de seña — así que el complejo hay que preguntárselo a MP.
   *
   * El ancla es `external_reference`, que `createPreapproval` ya setea al
   * tenantId. Para `subscription_authorized_payment` hay un salto de más: el
   * `data.id` es el cobro, que apunta a su preapproval, que tiene la
   * referencia.
   *
   * Devuelve null si MP no lo reconoce: el caller responde 200 e ignora, en vez
   * de reintentar para siempre un evento que nunca va a resolver.
   */
  resolveSubscriptionTenant(
    eventType: 'subscription_preapproval' | 'subscription_authorized_payment',
    dataId: string,
  ): Promise<string | null>
  /** `amount` in centavos ARS. */
  updatePreapprovalAmount(preapprovalId: string, amount: number): Promise<void>
  /**
   * One-off Preference for upgrade proration. external_reference is set to
   * `saas-upgrade:<tenantId>:<targetPlanId>` so the webhook dispatcher can
   * route the resulting payment to `billing.handleUpgradePayment`.
   */
  createSaasUpgradePreference(input: CreateSaasUpgradePreferenceInput): Promise<PreferenceResult>
}
