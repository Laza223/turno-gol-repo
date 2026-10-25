import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token del link de baja del mail de alertas de RIVAL (`/rival/baja?t=<token>`): prueba que quien
 * toca el link es quien recibió ESE mail, sin pedirle login. Hermano de `rival-intent.ts`: mismo
 * secreto (`IMPERSONATION_COOKIE_SECRET`), otro dominio HMAC (`rival-alert-unsub-v1`) para que un
 * token de "Voy" no sirva acá ni al revés. La primitiva se duplica a propósito, igual que en
 * `rival-intent.ts`, para no acoplar los dos archivos.
 *
 * SIN vencimiento: un link de baja que caduca deja al jugador recibiendo mails que pidió frenar.
 * Lo único que revoca el token es borrar la suscripción (la baja es idempotente).
 *
 * `verifyAlertUnsubToken` nunca lanza: cualquier invalidez (basura, firma, secreto ausente) es `null`.
 */

const HMAC_DOMAIN = 'rival-alert-unsub-v1'

export type AlertUnsubFields = { playerId: string; tenantId: string }

function getSecret(): string {
  const s = process.env.IMPERSONATION_COOKIE_SECRET
  if (!s || s.length < 16) {
    throw new Error('IMPERSONATION_COOKIE_SECRET missing or shorter than 16 chars')
  }
  return s
}

const sign = (payload: string): string =>
  createHmac('sha256', getSecret()).update(`${HMAC_DOMAIN}:${payload}`).digest('base64url')

/** Token para el link de baja de un mail de alerta. */
export function signAlertUnsubToken(fields: AlertUnsubFields): string {
  const payload = Buffer.from(
    JSON.stringify({ p: fields.playerId, t: fields.tenantId }),
    'utf8',
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** Jugador y complejo del token, o `null` si no es un token nuestro e intacto. */
export function verifyAlertUnsubToken(token: string | null | undefined): AlertUnsubFields | null {
  try {
    if (!token) return null
    const dot = token.indexOf('.')
    if (dot <= 0) return null
    const rawPayload = token.slice(0, dot)

    const a = Buffer.from(token.slice(dot + 1))
    const b = Buffer.from(sign(rawPayload))
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    const parsed: unknown = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { p, t } = parsed as Record<string, unknown>
    if (typeof p !== 'string' || typeof t !== 'string') return null
    return { playerId: p, tenantId: t }
  } catch {
    return null
  }
}
