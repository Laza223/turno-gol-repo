import { CircuitBreaker } from './mp-circuit-breaker'
import type { PaymentGateway } from './mp-gateway'

/**
 * Shared per-process circuit breaker for every outbound MercadoPago gateway
 * call (BK-03). After `failureThreshold` consecutive failures for a key it
 * fast-fails with `CircuitOpenError` instead of letting each call burn the 8s
 * SDK timeout — so a slow/down MP can't pin worker slots and back the queue up.
 *
 * Keyed per logical account (`tenant:<id>` for booking deposits, `saas-master`
 * for the SaaS billing account) so one complejo's MP trouble can't trip the
 * breaker for the rest. State is in-memory (Map), deliberately per-process for
 * v1 — see `mp-circuit-breaker.ts`.
 *
 * `CircuitOpenError` is intentionally a *transient* error and must never be
 * caught and turned into a terminal "payment failed" outcome:
 *   - workers already treat any throw as retryable (reconcile catches per-row
 *     and continues; the webhook handler throws inside the tenant tx → rollback
 *     reverts `processed_webhooks` → pg-boss retries),
 *   - the player checkout falls back to the existing expiry sweep + manual
 *     `retryDepositPaymentAction` path.
 */
const mpBreaker = new CircuitBreaker()

/**
 * Wrap a {@link PaymentGateway} so every call routes through the shared breaker
 * under `key`. Returns a new gateway; `inner` is untouched.
 *
 * `breaker` is a test seam — production callers use the shared per-process
 * instance.
 *
 * Every method forwards `...args` instead of naming its parameters: the
 * parameter types come from `PaymentGateway`, so a parameter added there flows
 * through without touching this file. Named parameters let an arrow with fewer
 * of them still satisfy the interface, which silently dropped
 * `updatePreapprovalAmount`'s `opts.reason` — MP got the new amount and kept
 * the old plan description.
 */
export function withCircuitBreaker(
  inner: PaymentGateway,
  key: string,
  breaker: CircuitBreaker = mpBreaker,
): PaymentGateway {
  return {
    createPreference: (...args) => breaker.execute(key, () => inner.createPreference(...args)),
    getPaymentStatus: (...args) => breaker.execute(key, () => inner.getPaymentStatus(...args)),
    searchPaymentsByReference: (...args) =>
      breaker.execute(key, () => inner.searchPaymentsByReference(...args)),
    createPreapproval: (...args) => breaker.execute(key, () => inner.createPreapproval(...args)),
    cancelPreapproval: (...args) => breaker.execute(key, () => inner.cancelPreapproval(...args)),
    resolveSubscriptionTenant: (...args) =>
      breaker.execute(key, () => inner.resolveSubscriptionTenant(...args)),
    getSubscriptionChargeInfo: (...args) =>
      breaker.execute(key, () => inner.getSubscriptionChargeInfo(...args)),
    getSubscriptionState: (...args) =>
      breaker.execute(key, () => inner.getSubscriptionState(...args)),
    updatePreapprovalAmount: (...args) =>
      breaker.execute(key, () => inner.updatePreapprovalAmount(...args)),
    createSaasUpgradePreference: (...args) =>
      breaker.execute(key, () => inner.createSaasUpgradePreference(...args)),
  }
}
