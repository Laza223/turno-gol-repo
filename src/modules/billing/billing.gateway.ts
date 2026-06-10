import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'
import { withCircuitBreaker } from '@/modules/payments/mp-breaker.gateway'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

/**
 * SaaS billing operations (preapproval create/cancel/update + upgrade
 * preference) run against TurnoGol's master MercadoPago account, NOT the
 * tenant's per-OAuth credentials (those are for booking deposits, ADR-004).
 *
 * Tests can override via `setBillingGateway` (similar to email.provider).
 */
let _override: PaymentGateway | null = null

export function setBillingGateway(gw: PaymentGateway | null): void {
  _override = gw
}

export function getBillingGateway(): PaymentGateway {
  if (_override) return _override
  const token = process.env.MP_TURNOGOL_ACCESS_TOKEN ?? ''
  return withCircuitBreaker(new MercadoPagoGateway(token), 'saas-master')
}
