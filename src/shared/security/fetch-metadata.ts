/**
 * Fetch Metadata (Sec-Fetch-*) request-isolation policy for state-changing
 * route handlers — a CSRF / cross-origin-abuse mitigation layered on top of
 * authentication. See docs/security-decisions.md.
 *
 * Modern browsers stamp every request with `Sec-Fetch-Site`, which the page's
 * own JavaScript cannot forge. A genuine cross-site form post or fetch to a
 * money/booking endpoint therefore arrives as `cross-site`; we reject those.
 *
 * The policy is intentionally permissive to keep false positives at zero on the
 * conversion path: only an explicit `cross-site` signal on a mutating method is
 * blocked. Absent headers (legacy browsers, server-to-server callers such as
 * the MercadoPago webhook) and `same-origin` / `same-site` / `none` all pass.
 */

/**
 * Path prefixes whose mutations must originate same-site: payments (billing) and
 * cancellations (admin + player booking lifecycle). Webhooks and OAuth/auth
 * callbacks are deliberately excluded — they are legitimately cross-site.
 */
export const SENSITIVE_MUTATION_PREFIXES = [
  '/api/billing',
  '/api/bookings',
  '/api/player/bookings',
] as const

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** True when `path` is (or is under) a sensitive-mutation prefix. */
export function isSensitiveMutationPath(path: string): boolean {
  return SENSITIVE_MUTATION_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}

/**
 * True when a state-changing request carries an explicit cross-site Fetch
 * Metadata signal and must be rejected. Non-mutating methods and any
 * non-`cross-site` (or absent) `Sec-Fetch-Site` value are allowed.
 */
export function isForbiddenCrossSiteMutation(
  method: string,
  secFetchSite: string | null,
): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false
  return secFetchSite === 'cross-site'
}
