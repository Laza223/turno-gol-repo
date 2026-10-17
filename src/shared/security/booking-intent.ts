import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PayMethod } from '@/lib/booking/reserve-url'

/**
 * Vínculo de intención: lo que deja confirmar la reserva SOLA cuando el jugador vuelve del ingreso
 * (magic link o Google) sin tocar un botón más. Mismo patrón que `google-terms-cookie.ts`: HMAC con
 * `IMPERSONATION_COOKIE_SECRET` y un dominio propio (`HMAC_DOMAIN`), sin pedir un secreto nuevo.
 *
 * Dos canales, con sub-dominios distintos para que un token de uno no sirva por el otro:
 * - `email`: viaja en el `next` del magic link (`?booking_intent=`), así que funciona aunque el mail
 *   se abra en otro navegador. La firma cubre `dominio:payload:email-normalizado` y se recalcula
 *   al volver con el email de la SESIÓN: otro email, otra firma. El email no viaja ni en el payload
 *   ni como hash en la URL.
 * - `cookie`: cookie HttpOnly `tg_booking_intent` para Google, mismo navegador. Sin email (la
 *   sesión es la de ese navegador).
 *
 * `verify*` nunca lanza: cualquier invalidez es `{ ok: false, reason }`. El `reason` alimenta la
 * telemetría (`checkout.intent_degraded`), nunca una decisión de seguridad.
 */

export const BOOKING_INTENT_COOKIE_NAME = 'tg_booking_intent'

/**
 * Atado a `otp_expiry` de `supabase/config.toml` (3600 s): el vínculo viaja DENTRO del enlace del
 * mail, y si vencía antes que el enlace, quien lo tocaba a los 40 minutos entraba y la promesa
 * "queda confirmada" ya no se cumplía. Si cambia `otp_expiry`, cambia esto (lo vigila un test).
 */
const EMAIL_TTL_MS = 60 * 60 * 1000
/** Cubre el ida y vuelta a Google. */
export const BOOKING_INTENT_COOKIE_TTL_MS = 10 * 60 * 1000

const HMAC_DOMAIN = 'booking-intent-v1'

type Channel = 'email' | 'cookie'

/** Lo que se va a reservar: el vínculo vale para ESTE turno y ningún otro. */
export type BookingIntentFields = {
  slug: string
  court: string
  date: string
  time: string
  dur: number
  pay: PayMethod | null
}

type BookingIntentFailure = 'invalid' | 'expired' | 'email_mismatch' | 'fields_mismatch'
export type BookingIntentCheck = { ok: true } | { ok: false; reason: BookingIntentFailure }

type Payload = {
  slug: string
  court: string
  date: string
  time: string
  dur: number
  pay?: string
  exp: number
}

const INVALID: BookingIntentCheck = { ok: false, reason: 'invalid' }

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
  fields: BookingIntentFields,
  email: string | null,
  ttlMs: number,
  nowMs: number,
): string {
  const body: Payload = {
    slug: fields.slug,
    court: fields.court,
    date: fields.date,
    time: fields.time,
    dur: fields.dur,
    ...(fields.pay ? { pay: fields.pay } : {}),
    exp: nowMs + ttlMs,
  }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(channel, payload, email)}`
}

const isString = (v: unknown): v is string => typeof v === 'string'

function parsePayload(raw: string): Payload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { slug, court, date, time, dur, pay, exp } = parsed as Record<string, unknown>
  if (!isString(slug) || !isString(court) || !isString(date) || !isString(time)) return null
  if (typeof dur !== 'number' || typeof exp !== 'number' || !Number.isFinite(exp)) return null
  if (pay !== undefined && !isString(pay)) return null
  return { slug, court, date, time, dur, ...(pay === undefined ? {} : { pay }), exp }
}

function check(
  channel: Channel,
  token: string | null | undefined,
  email: string | null,
  expected: BookingIntentFields,
  nowMs: number,
): BookingIntentCheck {
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
      // Con el payload bien formado, una firma que no cierra es en la práctica OTRO email (el
      // mail abierto por otra persona). Una alteración cae acá también: sin poner el email en la
      // URL no se distinguen, y no hace falta, porque ninguna de las dos confirma.
      return channel === 'email' ? { ok: false, reason: 'email_mismatch' } : INVALID
    }

    if (payload.exp <= nowMs) return { ok: false, reason: 'expired' }
    const same =
      payload.slug === expected.slug &&
      payload.court === expected.court &&
      payload.date === expected.date &&
      payload.time === expected.time &&
      payload.dur === expected.dur &&
      (payload.pay ?? null) === expected.pay
    return same ? { ok: true } : { ok: false, reason: 'fields_mismatch' }
  } catch {
    return INVALID
  }
}

/** Token para el `next` del magic link, ligado al email que se escribió. */
export function signEmailBookingIntent(
  fields: BookingIntentFields,
  email: string,
  nowMs: number = Date.now(),
): string {
  return issue('email', fields, email, EMAIL_TTL_MS, nowMs)
}

/** Valor de la cookie `tg_booking_intent` (Google). */
export function signCookieBookingIntent(
  fields: BookingIntentFields,
  nowMs: number = Date.now(),
): string {
  return issue('cookie', fields, null, BOOKING_INTENT_COOKIE_TTL_MS, nowMs)
}

export function verifyEmailBookingIntent(
  token: string | null | undefined,
  email: string | null | undefined,
  expected: BookingIntentFields,
  nowMs: number = Date.now(),
): BookingIntentCheck {
  // Sin email de sesión no hay con qué recalcular la firma.
  if (!email?.trim()) return INVALID
  return check('email', token, email, expected, nowMs)
}

export function verifyCookieBookingIntent(
  token: string | null | undefined,
  expected: BookingIntentFields,
  nowMs: number = Date.now(),
): BookingIntentCheck {
  return check('cookie', token, null, expected, nowMs)
}

/** Cuánto llegó a verificarse un intento fallido: expirado/campos implican firma válida. */
const REACH: Record<BookingIntentFailure, number> = {
  invalid: 1,
  email_mismatch: 2,
  expired: 3,
  fields_mismatch: 3,
}

/**
 * Lo que la page y la action necesitan: qué token vino (el del enlace/form y/o la cookie) y si
 * alguno vale para ESTE turno con ESTA sesión. `null` = no vino ninguno (visita normal). El form lleva
 * el token del mail o, para Google, el marcador `cookie`: el valor de la cookie HttpOnly nunca sale
 * al cliente, y solo verifica con la cookie presente. Si ambos fallan, informa el que llegó más lejos.
 */
export function checkBookingIntent(
  input: {
    linkToken?: string | null
    cookieToken?: string | null
    email?: string | null
  },
  expected: BookingIntentFields,
  nowMs: number = Date.now(),
): BookingIntentCheck | null {
  const { linkToken, cookieToken, email } = input
  if (!linkToken && !cookieToken) return null
  const results: BookingIntentCheck[] = []
  if (linkToken) results.push(verifyEmailBookingIntent(linkToken, email, expected, nowMs))
  if (cookieToken) results.push(verifyCookieBookingIntent(cookieToken, expected, nowMs))
  const ok = results.find((r) => r.ok)
  if (ok) return ok
  const failures = results.filter((r): r is { ok: false; reason: BookingIntentFailure } => !r.ok)
  return failures.reduce((best, f) => (REACH[f.reason] > REACH[best.reason] ? f : best))
}
