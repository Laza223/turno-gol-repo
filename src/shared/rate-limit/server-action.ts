import { enforce } from './apply'

/**
 * User-facing message returned by an admin Server Action when the `adminCrud`
 * rate-limit trips. Spanish rioplatense, matches the tone of existing action
 * error strings (e.g. login's "Demasiados intentos…").
 */
export const ADMIN_RATE_LIMIT_MESSAGE =
  'Demasiadas operaciones en poco tiempo. Esperá unos segundos e intentá de nuevo.'

/**
 * Enforce the `adminCrud` policy inside a Server Action. Route handlers return a
 * 429 `Response` via `guard()`, but Server Actions return a result object — so
 * this helper maps the rate-limit outcome to a message the caller folds into its
 * own `{ success: false, error }` shape.
 *
 *   const limited = await adminRateLimited(tenant.id)
 *   if (limited) return { success: false, error: limited }
 *
 * Returns `null` when the request may proceed.
 */
export async function adminRateLimited(tenantId: string): Promise<string | null> {
  const outcome = await enforce('adminCrud', tenantId)
  return outcome.ok ? null : ADMIN_RATE_LIMIT_MESSAGE
}
