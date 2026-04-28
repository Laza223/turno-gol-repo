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
  return new MercadoPagoConfig({
    accessToken: decrypt(encryptedAccessToken),
    options: { timeout: 8000 },
  })
}
