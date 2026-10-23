import { createHmac, timingSafeEqual } from 'node:crypto'
import { BOOKING_INTENT_COOKIE_TTL_MS } from '@/shared/security/booking-intent'

/**
 * Vínculo de intención de RIVAL: prueba que el jugador tocó "Voy" para ESTE partido antes de
 * entrar (magic link o Google), así que al volver se suma solo o ve la bienvenida. Hermano de
 * `booking-intent.ts`: mismo secreto (`IMPERSONATION_COOKIE_SECRET`), mismos dos canales y mismos
 * TTL, con otro dominio HMAC (`rival-intent-v1`) para que un token de reserva no sirva acá.
 *
 * Se duplica la primitiva HMAC (sign/check) y no se comparte con `booking-intent.ts` a propósito:
 * hacerlo exige refactorizar un archivo que protege la reserva, fuera del alcance de RIVAL.
 *
 * - `email`: viaja en el `next` del magic link (`?rival_intent=`), ligado al email de la sesión.
 * - `cookie`: cookie HttpOnly `tg_rival_intent` para Google, mismo navegador, sin email.
 *
 * `check` nunca lanza: cualquier invalidez es `{ ok: false, reason }`.
 */

export const RIVAL_INTENT_COOKIE_NAME = 'tg_rival_intent'
/** Param del `next` del magic link que lleva el token. */
export const RIVAL_INTENT_PARAM = 'rival_intent'
/** Cubre el ida y vuelta a Google (igual que la reserva). */
export const RIVAL_INTENT_COOKIE_TTL_MS = BOOKING_INTENT_COOKIE_TTL_MS

/** Atado a `otp_expiry` (3600 s), igual que `EMAIL_TTL_MS` de la reserva. */
const EMAIL_TTL_MS = 60 * 60 * 1000
const HMAC_DOMAIN = 'rival-intent-v1'

type Channel = 'email' | 'cookie'

/** Lo que se va a sumar: el vínculo vale para ESTE partido y ningún otro. */
export type RivalIntentFields = { code: string }

type RivalIntentFailure = 'invalid' | 'expired' | 'email_mismatch' | 'fields_mismatch'
export type RivalIntentCheck = { ok: true } | { ok: false; reason: RivalIntentFailure }

const INVALID: RivalIntentCheck = { ok: false, reason: 'invalid' }

function getSecret(): string {
  const s = process.env.IMPERSONATION_COOKIE_SECRET
  if (!s || s.length < 16) {
    throw new Error('IMPERSONATION_COOKIE_SECRET missing or shorter than 16 chars')
  }
  return s
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

function sign(channel: Channel, payload: string, email: string | null): string {
  const bound = channel === 'email' ? `:${normalizeEmail(email ?? '')}` : ''
  return createHmac('sha256', getSecret())
    .update(`${HMAC_DOMAIN}:${channel}:${payload}${bound}`)
    .digest('base64url')
}

function issue(
  channel: Channel,
  fields: RivalIntentFields,
  email: string | null,
  ttlMs: number,
  nowMs: number,
): string {
  const payload = Buffer.from(
    JSON.stringify({ code: fields.code, exp: nowMs + ttlMs }),
    'utf8',
  ).toString('base64url')
  return `${payload}.${sign(channel, payload, email)}`
}

function parsePayload(raw: string): { code: string; exp: number } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { code, exp } = parsed as Record<string, unknown>
  if (typeof code !== 'string' || typeof exp !== 'number' || !Number.isFinite(exp)) return null
  return { code, exp }
}

function check(
  channel: Channel,
  token: string | null | undefined,
  email: string | null,
  expected: RivalIntentFields,
  nowMs: number,
): RivalIntentCheck {
  try {
    if (!token) return INVALID
    const dot = token.indexOf('.')
    if (dot <= 0) return INVALID
    const rawPayload = token.slice(0, dot)
    const payload = parsePayload(rawPayload)
    if (!payload) return INVALID

    const a = Buffer.from(token.slice(dot + 1))
    const b = Buffer.from(sign(channel, rawPayload, email))
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      // Payload bien formado con firma que no cierra: en la práctica OTRO email (mail abierto por
      // otra persona). Una alteración cae acá también; ninguna de las dos suma a nadie.
      return channel === 'email' ? { ok: false, reason: 'email_mismatch' } : INVALID
    }

    if (payload.exp <= nowMs) return { ok: false, reason: 'expired' }
    return payload.code === expected.code ? { ok: true } : { ok: false, reason: 'fields_mismatch' }
  } catch {
    return INVALID
  }
}

/** Token para el `next` del magic link, ligado al email que se escribió. */
export function signEmailRivalIntent(
  fields: RivalIntentFields,
  email: string,
  nowMs: number = Date.now(),
): string {
  return issue('email', fields, email, EMAIL_TTL_MS, nowMs)
}

/** Valor de la cookie `tg_rival_intent` (Google). */
export function signCookieRivalIntent(
  fields: RivalIntentFields,
  nowMs: number = Date.now(),
): string {
  return issue('cookie', fields, null, RIVAL_INTENT_COOKIE_TTL_MS, nowMs)
}

/** Cuánto llegó a verificarse un intento fallido: expirado/campos implican firma válida. */
const REACH: Record<RivalIntentFailure, number> = {
  invalid: 1,
  email_mismatch: 2,
  expired: 3,
  fields_mismatch: 3,
}

/**
 * Si alguno de los tokens que vinieron (enlace del mail y/o cookie) vale para ESTE partido con
 * ESTA sesión. `null` = no vino ninguno (visita normal). Si ambos fallan, informa el que llegó
 * más lejos. Misma semántica que `checkBookingIntent`.
 */
export function checkRivalIntent(
  input: { linkToken?: string | null; cookieToken?: string | null; email?: string | null },
  expected: RivalIntentFields,
  nowMs: number = Date.now(),
): RivalIntentCheck | null {
  const { linkToken, cookieToken, email } = input
  if (!linkToken && !cookieToken) return null
  const results: RivalIntentCheck[] = []
  // Sin email de sesión no hay con qué recalcular la firma del canal email.
  if (linkToken) {
    results.push(email?.trim() ? check('email', linkToken, email, expected, nowMs) : INVALID)
  }
  if (cookieToken) results.push(check('cookie', cookieToken, null, expected, nowMs))
  const ok = results.find((r) => r.ok)
  if (ok) return ok
  const failures = results.filter((r): r is { ok: false; reason: RivalIntentFailure } => !r.ok)
  return failures.reduce((best, f) => (REACH[f.reason] > REACH[best.reason] ? f : best))
}
