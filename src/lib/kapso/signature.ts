import { createHmac, timingSafeEqual } from 'node:crypto'
import { isNonProductionRuntime } from '@/shared/runtime-env'

/**
 * Firma de los webhooks de Kapso: `X-Webhook-Signature` = HMAC-SHA256 en hex
 * del body CRUDO, sin prefijo `sha256=` (docs.kapso.ai › webhooks › security).
 *
 * Se verifica sobre los bytes tal como llegaron: re-serializar el JSON cambia
 * espacios y orden y rompe la firma.
 *
 * Sin `KAPSO_WEBHOOK_SECRET`: fail-closed en producción, abierto en dev/test
 * (mismo criterio que `verifyWebhookSignature` de MercadoPago).
 */
export function verifyKapsoSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET
  if (!secret) return isNonProductionRuntime()
  if (!signature) return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signature.trim().toLowerCase())
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
