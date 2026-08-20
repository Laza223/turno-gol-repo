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
 */
export function withCircuitBreaker(
  inner: PaymentGateway,
  key: string,
  breaker: CircuitBreaker = mpBreaker,
): PaymentGateway {
  return {
    createPreference: (input) => breaker.execute(key, () => inner.createPreference(input)),
    getPaymentStatus: (id) => breaker.execute(key, () => inner.getPaymentStatus(id)),
    createRefund: (id, amount, idempotencyKey) =>
      breaker.execute(key, () => inner.createRefund(id, amount, idempotencyKey)),
    searchPaymentsByReference: (ref) =>
      breaker.execute(key, () => inner.searchPaymentsByReference(ref)),
    createPreapproval: (input) => breaker.execute(key, () => inner.createPreapproval(input)),
    cancelPreapproval: (id) => breaker.execute(key, () => inner.cancelPreapproval(id)),
    resolveSubscriptionTenant: (eventType, dataId) =>
      breaker.execute(key, () => inner.resolveSubscriptionTenant(eventType, dataId)),
    updatePreapprovalAmount: (id, amount) =>
      breaker.execute(key, () => inner.updatePreapprovalAmount(id, amount)),
    createSaasUpgradePreference: (input) =>
      breaker.execute(key, () => inner.createSaasUpgradePreference(input)),
  }
}
