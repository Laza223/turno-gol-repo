/**
 * PII scrubbing helpers for Sentry beforeSend (Ley 25.326 / B9 audit).
 *
 * Scrub structured fields whose names commonly carry personal data so they
 * never reach Sentry. Used by sentry.server.config.ts. Exported separately so
 * it can be unit-tested without spinning up Sentry.
 */

export const PII_KEYS: ReadonlySet<string> = new Set([
  'email',
  'phone',
  'phone_number',
  'dni',
  'mp_access_token',
  'mp_refresh_token',
  'access_token',
  'refresh_token',
  'authorization',
])

export function scrubObject(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map((item) => scrubObject(item, depth + 1))
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = scrubObject(v, depth + 1)
      }
    }
    return out
  }
  return obj
}

export function scrubQueryString(qs: string): string {
  return qs.replace(/([?&])(email|token|access_token|refresh_token)=[^&]*/gi, '$1$2=[REDACTED]')
}
