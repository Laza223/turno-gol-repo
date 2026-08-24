import type {
  CreatePreapprovalInput,
  CreatePreferenceInput,
  CreateSaasUpgradePreferenceInput,
  GatewayPaymentInfo,
  GatewaySubscriptionState,
  PreapprovalResult,
  PreferenceResult,
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
   * **`payment` también entra acá**, y en la práctica es EL caso: el panel de
   * MercadoPago avisa el cobro de una suscripción como un `payment` común.
   * Medido en el historial de notificaciones de producción el 2026-08-20 — las
   * dos únicas entregas del día fueron `payment.created` con el id del pago, y
   * ninguna de tipo suscripción, con "Planes y suscripciones" tildado igual. Un
   * `payment` sólo resuelve si el pago está ligado a un preapproval; una venta
   * suelta de la cuenta master (un QR, un Point) devuelve null y se ignora.
   *
   * Devuelve null si MP no lo reconoce: el caller responde 200 e ignora, en vez
   * de reintentar para siempre un evento que nunca va a resolver.
   */
  resolveSubscriptionTenant(
    eventType: 'subscription_preapproval' | 'subscription_authorized_payment' | 'payment',
    dataId: string,
  ): Promise<string | null>
  /**
   * El cobro mensual de una suscripción, leído de la FACTURA y no de la API
   * de pagos.
   *
   * `subscription_authorized_payment` trae en `data.id` el id del
   * `authorized_payment` (la factura del mes), que **no existe** en
   * `/v1/payments` — verificado en producción el 2026-08-20: ese GET devuelve
   * 404 y el pago real es otro id, anidado adentro de la factura. Usar
   * `getPaymentStatus` acá hacía fallar el job en cada intento con el cobro ya
   * cobrado.
   */
  getSubscriptionChargeInfo(authorizedPaymentId: string): Promise<GatewayPaymentInfo>
  /**
   * Estado real de una suscripción, preguntado a MercadoPago.
   *
   * Lo usa `reconcile-subscriptions.worker.ts` como red de rescate: el paso
   * `trialing → active` depende de que llegue el aviso del cobro, y cuando ese
   * aviso se pierde el complejo paga y queda en prueba hasta que
   * `expire-trials` lo apaga. Pasó de verdad el 2026-08-20 (ver el diseño en
   * `docs/superpowers/specs/2026-08-20-reconcile-subscriptions-design.md` §2).
   *
   * Devuelve null si MP no reconoce el preapproval (404): reintentar no lo va a
   * cambiar, así que el caller lo reporta como desincronización en vez de
   * fallar y reintentar para siempre.
   */
  getSubscriptionState(preapprovalId: string): Promise<GatewaySubscriptionState | null>
  /** `amount` in centavos ARS. */
  updatePreapprovalAmount(preapprovalId: string, amount: number): Promise<void>
  /**
   * One-off Preference for upgrade proration. external_reference is set to
   * `saas-upgrade:<tenantId>:<targetPlanId>` so the webhook dispatcher can
   * route the resulting payment to `billing.handleUpgradePayment`.
   */
  createSaasUpgradePreference(input: CreateSaasUpgradePreferenceInput): Promise<PreferenceResult>
}
