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
  // `token` a secas: el regex viejo de `scrubQueryString` lo cubría por fuera
  // de esta lista (ver hallazgo #7) — se suma acá para que quede una sola
  // fuente y no se pierda cobertura al unificar.
  'token',
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

// Construido desde PII_KEYS a propósito: antes era una segunda lista a mano
// (`email|token|access_token|refresh_token`) que se desincronizó de la de
// arriba — `mp_access_token`/`mp_refresh_token`/`phone`/`phone_number`/`dni`
// estaban en PII_KEYS pero el regex nunca los reconocía (hallazgo #7, campaña
// de mutación). Una sola fuente de verdad: agregar una clave nueva a
// PII_KEYS ahora cubre objetos Y query strings.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const PII_QUERY_PATTERN = new RegExp(
  `([?&])(${[...PII_KEYS].map(escapeRegExp).join('|')})=[^&]*`,
  'gi',
)

export function scrubQueryString(qs: string): string {
  return qs.replace(PII_QUERY_PATTERN, '$1$2=[REDACTED]')
}
