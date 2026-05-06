import { timingSafeEqual } from 'node:crypto'

/**
 * Validates the `X-Webhook-Secret` header against `MP_WEBHOOK_SECRET`.
 *
 * Behavior:
 *   - secret env unset + non-production → return true (dev/test).
 *   - secret env unset + production → return false (fail closed).
 *   - secret env set + header missing or mismatched → return false.
 *   - secret env set + header equal → return true (timing-safe compare).
 */
export function verifyWebhookSecret(headerValue: string | null): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  if (!headerValue) return false
  const a = Buffer.from(headerValue)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
