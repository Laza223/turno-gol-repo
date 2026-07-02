import { createHmac, timingSafeEqual } from 'node:crypto'
import { MP_MOCK_ENABLED, isNonProductionRuntime } from '@/modules/payments/mock-mp'

/**
 * Validates Mercado Pago webhook signatures via HMAC SHA-256.
 * Manifest format: `id:{data.id};request-id:{x-request-id};ts:{ts};`
 *
 * `data.id` is lowercased per MP spec: MP returns alphanumeric IDs in
 * uppercase (e.g. subscription/preapproval `ORD01...`) but the manifest
 * must use them lowercase or the HMAC won't match.
 *
 * Behavior:
 *   - MP_MOCK_ENABLED → bypass validation (E2E/Local dev without ngrok).
 *   - missing headers/env → fail closed (unless not production and no secret).
 *   - valid HMAC against MP_WEBHOOK_SECRET → return true (timing-safe compare).
 *   - invalid against MP_WEBHOOK_SECRET, but isNonProductionRuntime() AND
 *     MP_WEBHOOK_TEST_BYPASS_SECRET is set → retry the SAME HMAC check against
 *     that secret (MP-WEBHOOK-001: lets scripts/replay-mp-webhook.ts sign
 *     fixtures without ever needing the real MP_WEBHOOK_SECRET). Still a real
 *     signature check, not a skip — and hard-gated so a leaked value can never
 *     validate anything in production, same pattern as MP_MOCK_ENABLED above.
 */
export function verifyWebhookSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
): boolean {
  if (MP_MOCK_ENABLED) return true

  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'

  if (!xSignature || !xRequestId || !dataId) return false

  // Parse `ts` and `v1` from x-signature (e.g. "ts=123,v1=abc")
  let ts = ''
  let v1 = ''
  for (const part of xSignature.split(',')) {
    const [key, val] = part.split('=')
    if (key === 'ts') ts = val?.trim()
    else if (key === 'v1') v1 = val?.trim()
  }

  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`

  if (matchesHmac(secret, manifest, v1)) return true

  const testSecret = process.env.MP_WEBHOOK_TEST_BYPASS_SECRET
  if (testSecret && isNonProductionRuntime()) {
    return matchesHmac(testSecret, manifest, v1)
  }

  return false
}

function matchesHmac(secret: string, manifest: string, v1: string): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  const a = Buffer.from(v1)
  const b = Buffer.from(expectedSignature)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
