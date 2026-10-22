import { and, eq } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getDb } from '@/shared/db/client'
import { decrypt, encrypt } from '@/lib/crypto/encrypt'
import { logger } from '@/shared/lib/logger'
import { captureException } from '@/lib/sentry'
import { MercadoPagoGateway } from './mp-gateway.implementation'
import { withCircuitBreaker } from './mp-breaker.gateway'
import { MpGatewayError, MpGrantRevokedError, TenantMpNotConnectedError } from './payment.errors'
import type { PaymentGateway } from './mp-gateway'
import { MP_MOCK_ENABLED, LocalMockGateway } from './mock-mp'
import { MP_GET_TIMEOUT_MS } from './mp-gateway.implementation'
import { markMpDisconnected, type MpDisconnectDetectedBy } from './mp-connection.service'

const MP_OAUTH_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'

type MpRefreshResponse = {
  access_token?: string
  refresh_token?: string
  user_id?: number
  public_key?: string
  expires_in?: number
}

/** Los dos códigos del endpoint de token que dicen "el complejo revocó el permiso". */
function isGrantRevokedCode(value: string | null): value is MpGrantRevokedError['mpError'] {
  return value === 'invalid_grant' || value === 'unauthorized_client'
}

/**
 * Código OAuth del rechazo (`{ error: 'invalid_grant', ... }`), o `null` si el
 * body no es JSON o no lo trae. Compara contra un conjunto CERRADO, así que un
 * texto libre de MP nunca se lee como revocación. El body no se loguea.
 */
async function readOAuthErrorCode(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null) return null
    const { error, message } = body as { error?: unknown; message?: unknown }
    if (typeof error === 'string') return error
    return typeof message === 'string' ? message : null
  } catch {
    return null
  }
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
    const code = await readOAuthErrorCode(res)
    // Solo un 4xx con uno de los dos códigos es "el complejo revocó el
    // permiso". `invalid_client` (credenciales de TurnoGol), un 5xx o un body
    // ilegible siguen siendo un error de gateway: no marcan al complejo.
    if (res.status >= 400 && res.status < 500 && isGrantRevokedCode(code)) {
      throw new MpGrantRevokedError(code, res.status)
    }
    // El código va al mensaje (y de ahí a logs y Sentry) solo si tiene forma
    // de código OAuth: un `message` libre de MP podría repetir el token.
    const safeCode = code && /^[a-z_]{1,40}$/.test(code) ? code : null
    throw new MpGatewayError(
      `MP token refresh failed (HTTP ${res.status}${safeCode ? `, ${safeCode}` : ''})`,
    )
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
 *
 * Si MP contesta que el permiso ya no existe (`MpGrantRevokedError`), marca al
 * complejo como desconectado antes de propagar el error; un refresh exitoso
 * limpia esa marca. `detectedBy` solo viaja al audit log.
 */
export async function refreshTenantMpToken(
  tenantId: string,
  detectedBy: MpDisconnectDetectedBy = 'refresh_on_401',
): Promise<string> {
  const db = getDb()
  const rows = await db
    .select({
      mpRefreshToken: tenants.mpRefreshToken,
      mpDisconnectedAt: tenants.mpDisconnectedAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  const encryptedRefresh = rows[0]?.mpRefreshToken
  if (!encryptedRefresh) throw new TenantMpNotConnectedError(tenantId)

  // La llamada a MP va FUERA de toda transacción (convenciones-stack: un efecto
  // externo nunca adentro de una tx SQL). A partir de acá el refresh token
  // viejo ya está MUERTO del lado de MercadoPago: rota y es de un solo uso.
  let fresh: MpRefreshedTokens
  try {
    fresh = await refreshMpAccessToken(encryptedRefresh)
  } catch (err) {
    if (err instanceof MpGrantRevokedError) {
      await markMpDisconnected({
        tenantId,
        usedRefreshToken: encryptedRefresh,
        detectedBy,
        mpError: err.mpError,
      })
    }
    throw err
  }
  const encryptedAccess = encrypt(fresh.accessToken)

  // Compare-and-set: solo pisamos la fila si el refresh token sigue siendo el
  // que usamos para pedir este par. Resuelve la concurrencia sin candado y sin
  // meter la llamada HTTP adentro de una transacción.
  //
  // El caso real: este camino corre DENTRO del webhook de pagos (onUnauthorized
  // → withTokenRefresh), donde dos 401 simultáneos disparaban dos refrescos con
  // el mismo token. Antes los dos escribían y el último en llegar dejaba
  // persistido un token que MP ya había invalidado, y el complejo quedaba
  // desconectado en silencio: sin poder cobrar señas y sin que nadie se entere.
  // Con el WHERE de abajo, el segundo no pisa nada.
  const updated = await db
    .update(tenants)
    .set({
      mpAccessToken: encryptedAccess,
      mpRefreshToken: encrypt(fresh.refreshToken),
      ...(fresh.userId ? { mpUserId: fresh.userId } : {}),
      ...(fresh.publicKey ? { mpPublicKey: fresh.publicKey } : {}),
      mpConnectedAt: new Date(),
      // Un refresh que anda prueba que el permiso está vivo: cura la marca.
      mpDisconnectedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(tenants.id, tenantId), eq(tenants.mpRefreshToken, encryptedRefresh)))
    .returning({ id: tenants.id })

  if (updated.length === 0) {
    // Cero filas no es un no-op inocente, y hasta ahora era indistinguible de
    // un éxito. Dos lecturas posibles, las dos graves si quedan mudas:
    //   - otro proceso ganó la carrera y ya persistió su par: el nuestro se
    //     pierde, pero la fila quedó consistente;
    //   - el complejo desapareció en el medio.
    // En ambos casos el token que devolveríamos no es el que la base tiene.
    logger.error('mp token refresh did not persist', { module: 'mp-oauth', tenantId })
    const err = new MpGatewayError(
      `El refresh de MP del complejo ${tenantId} no se persistió (otro refresco ganó la carrera o el complejo ya no existe).`,
    )
    captureException(err)
    throw err
  }

  if (rows[0]?.mpDisconnectedAt) {
    // Estaba marcado y el refresh anduvo: o el dueño volvió a autorizar por
    // fuera de TurnoGol, o la marca fue un falso positivo. Queda rastro.
    logger.warn('mp: refresh exitoso sobre un complejo marcado; se limpia la marca', {
      module: 'mp-oauth',
      tenantId,
    })
  }

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
