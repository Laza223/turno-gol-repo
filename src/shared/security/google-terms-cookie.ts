import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Cookie de consentimiento diferido para Google OAuth (jugador, LoginGate).
 *
 * Por qué existe: `signInWithOAuth` no soporta `options.data` (a diferencia de
 * `signInWithOtp`), así que no hay forma de mandarle a Supabase "este jugador
 * tildó el checkbox de términos" en el mismo viaje que usa el magic link. La
 * primera versión de este flujo mandaba `agreed=1` como query param en el
 * `redirectTo` — Supabase lo reenvía tal cual junto al `code` una vez que
 * Google contesta. Revisión adversarial 2026-08-14: ese query param viaja por
 * una URL externa (por Google y de vuelta) sin firma — se podía forzar
 * `agreed=1` sin haber tildado nada. Esta cookie HttpOnly + firmada la
 * reemplaza: se setea server-side DESPUÉS de validar el checkbox real, viaja
 * invisible a JS/URL y no se puede forjar sin el secreto.
 *
 * Reusa `IMPERSONATION_COOKIE_SECRET` (con un namespace propio en lo que
 * firma, ver `HMAC_DOMAIN`) en vez de pedir un secreto nuevo — un env var más
 * es requerido en TODOS los ambientes porque `validateServerEnv` lo exige al
 * arranque (rompe `pnpm dev`/CI/Vercel prod si falta, sin aviso previo) para
 * proteger un dato de bajo riesgo (una declaración jurada de +18 solo sobre
 * la cuenta propia, no cross-user). El namespace en el HMAC da separación de
 * dominio: comprometer esta cookie no da la firma de la de impersonación ni
 * viceversa, sin agregar infraestructura nueva.
 */

export const GOOGLE_TERMS_COOKIE_NAME = 'tg_google_terms'

/** TTL corto: solo cubre el ida-y-vuelta a la pantalla de consentimiento de Google. */
export const GOOGLE_TERMS_COOKIE_TTL_MS = 10 * 60 * 1000

const HMAC_DOMAIN = 'google-terms-cookie-v1'

type Payload = { termsVersion: string; exp: number }

function getSecret(): string {
  const s = process.env.IMPERSONATION_COOKIE_SECRET
  if (!s || s.length < 16) {
    throw new Error('IMPERSONATION_COOKIE_SECRET missing or shorter than 16 chars')
  }
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(`${HMAC_DOMAIN}:${payload}`).digest('base64url')
}

/** Construye el valor de la cookie firmada. `nowMs` inyectable para tests. */
export function buildGoogleTermsCookie(termsVersion: string, nowMs: number = Date.now()): string {
  const body: Payload = { termsVersion, exp: nowMs + GOOGLE_TERMS_COOKIE_TTL_MS }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

/**
 * Verifica firma + expiración. `null` si la cookie es inválida por cualquier
 * motivo (firma alterada, payload corrupto, expirada, campos faltantes o
 * ausente). Nunca lanza.
 */
export function verifyGoogleTermsCookie(
  value: string | undefined | null,
  nowMs: number = Date.now(),
): { termsVersion: string } | null {
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null

  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = sign(payload)

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const { termsVersion, exp } = parsed as Record<string, unknown>
  if (typeof termsVersion !== 'string' || termsVersion.length === 0) return null
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
  if (exp <= nowMs) return null

  return { termsVersion }
}
