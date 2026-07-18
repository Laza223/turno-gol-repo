import { MercadoPagoConfig } from 'mercadopago'
import { decrypt } from '@/lib/crypto/encrypt'

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
    options: { timeout: 8000 },
  })
}
