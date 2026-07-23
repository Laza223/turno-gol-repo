import { eq } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getDb } from '@/shared/db/client'
import { decrypt, encrypt } from '@/lib/crypto/encrypt'
import { MercadoPagoGateway } from './mp-gateway.implementation'
import { withCircuitBreaker } from './mp-breaker.gateway'
import { MpGatewayError, TenantMpNotConnectedError } from './payment.errors'
import type { PaymentGateway } from './mp-gateway'
import { MP_MOCK_ENABLED, LocalMockGateway } from './mock-mp'
import { MP_GET_TIMEOUT_MS } from './mp-gateway.implementation'

const MP_OAUTH_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'

type MpRefreshResponse = {
  access_token?: string
  refresh_token?: string
  user_id?: number
  public_key?: string
  expires_in?: number
}

export type MpRefreshedTokens = {
  accessToken: string
  refreshToken: string
  userId?: string
  publicKey?: string
}

/**
 * Exchange an (encrypted) refresh token for a fresh access token via the MP
 * OAuth endpoint (grant_type=refresh_token). Mirrors the authorization_code
 * exchange in `app/api/mp/callback/route.ts`. Returns plaintext tokens.
 */
export async function refreshMpAccessToken(
  encryptedRefreshToken: string,
): Promise<MpRefreshedTokens> {
  const clientId = process.env.MP_CLIENT_ID ?? ''
  const clientSecret = process.env.MP_CLIENT_SECRET ?? ''
  if (!clientId || !clientSecret) {
    throw new MpGatewayError('MP_CLIENT_ID / MP_CLIENT_SECRET not configured')
  }

  const refreshToken = decrypt(encryptedRefreshToken)

  // Sin señal de aborto este fetch era el único punto ILIMITADO de la cadena
  // de pagos: ni el SDK (MP_GET_TIMEOUT_MS) ni el circuit breaker lo acotan,
  // y el refresh-on-401 puede dispararse dentro de una tx abierta
  // (mp-webhook.handler) — con idle_in_transaction_session_timeout finito
  // (migr. 055) un OAuth lento mataría la tx entera.
  const res = await fetch(MP_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(MP_GET_TIMEOUT_MS),
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    throw new MpGatewayError(`MP token refresh failed (HTTP ${res.status})`)
  }

  const data = (await res.json()) as MpRefreshResponse
  if (!data.access_token || !data.refresh_token) {
    throw new MpGatewayError('MP token refresh returned no tokens')
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    ...(data.user_id !== undefined ? { userId: String(data.user_id) } : {}),
    ...(data.public_key !== undefined ? { publicKey: data.public_key } : {}),
  }
}

/**
 * Refresh one tenant's MP credentials and persist the new (encrypted) tokens.
 * Returns the new **encrypted** access token (the gateway feeds it back into
 * `mpClient`). Throws if the tenant has no refresh token on file.
 */
export async function refreshTenantMpToken(tenantId: string): Promise<string> {
  const db = getDb()
  const rows = await db
    .select({ mpRefreshToken: tenants.mpRefreshToken })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  const encryptedRefresh = rows[0]?.mpRefreshToken
  if (!encryptedRefresh) throw new TenantMpNotConnectedError(tenantId)

  const fresh = await refreshMpAccessToken(encryptedRefresh)
  const encryptedAccess = encrypt(fresh.accessToken)

  await db
    .update(tenants)
    .set({
      mpAccessToken: encryptedAccess,
      mpRefreshToken: encrypt(fresh.refreshToken),
      ...(fresh.userId ? { mpUserId: fresh.userId } : {}),
      ...(fresh.publicKey ? { mpPublicKey: fresh.publicKey } : {}),
      mpConnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))

  return encryptedAccess
}

/**
 * Build a per-tenant gateway wired with the 401 refresh-and-retry fail-safe
 * (Hallazgo 4). Use this on automated server paths (e.g. webhook processing)
 * where a stale token can't be recovered by a human.
 */
export function resolveTenantGateway(
  tenantId: string,
  encryptedAccessToken: string,
): PaymentGateway {
  if (MP_MOCK_ENABLED) return new LocalMockGateway()
  return withCircuitBreaker(
    new MercadoPagoGateway(encryptedAccessToken, {
      onUnauthorized: () => refreshTenantMpToken(tenantId),
    }),
    `tenant:${tenantId}`,
  )
}
