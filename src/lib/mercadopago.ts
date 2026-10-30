import { MercadoPagoConfig } from 'mercadopago'
import { decrypt } from '@/lib/crypto/encrypt'

/**
 * Los reintentos del SDK 2: dos intentos en total, solo ante un 5xx o un corte
 * de red. El SDK 3 hace cuatro por defecto y también reintenta los 429
 * esperando el `Retry-After` (hasta 30 s): ante un MP lento, el webhook y el
 * polling de la seña pasaban de ~18 s a ~39 s. La idempotency key es la misma
 * en todos los intentos, así que reintentar un `create` no lo duplica.
 */
const MP_RETRY_OPTIONS = { maxRetries: 1, retryOn: [500, 502, 503, 504] }

/**
 * Build a per-tenant MP SDK client from an encrypted access token stored in
 * `tenants.mp_access_token`. Each tenant has its own OAuth credentials
 * (ADR-004): one MP cobranza account per complejo.
 *
 * 8s timeout enforces doc5 NFR (p95 <500ms; MP must not stall the request).
 */
export function mpClient(encryptedAccessToken: string): MercadoPagoConfig {
  return mpClientFromPlaintext(decrypt(encryptedAccessToken))
}

/**
 * Variante para tokens que YA están en claro — hoy solo el master del SaaS
 * (`MP_TURNOGOL_ACCESS_TOKEN`, viene del env, no de la DB). ENS-22: pasarlo
 * por `mpClient` lo mandaba a decrypt() y toda operación de billing daba
 * "Invalid ciphertext format".
 */
export function mpClientFromPlaintext(accessToken: string): MercadoPagoConfig {
  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000, ...MP_RETRY_OPTIONS },
  })
}
