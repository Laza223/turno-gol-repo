import type {
  CreatePreferenceInput,
  GatewayPaymentInfo,
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
  createRefund(mpPaymentId: string, amount?: number): Promise<RefundResult>
}
