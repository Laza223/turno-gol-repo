import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Cookie de intención "dueño" para el alta con Google.
 *
 * Por qué existe: Google OAuth era solo de jugadores, y el callback trata como
 * jugador a toda cuenta que vuelve con `code`. `signInWithOAuth` no deja mandar
 * datos propios a Supabase y un query param en el `redirectTo` viaja por una URL
 * externa sin firma (misma razón que `google-terms-cookie.ts`): cualquiera podría
 * forjarlo. Esta cookie HttpOnly firmada la setea el servidor al arrancar
 * `/register` con Google y el callback la lee para tratar la cuenta como staff.
 *
 * Se borra al usarla (un solo uso) y vence a los 10 minutos. Reusa
 * `IMPERSONATION_COOKIE_SECRET` con su propio namespace de HMAC, igual que
 * `google-terms-cookie.ts`: una cookie de un tipo no verifica como la del otro.
 */

export const OWNER_INTENT_COOKIE_NAME = 'tg_owner_intent'

/** TTL corto: solo cubre el ida-y-vuelta a la pantalla de Google. */
export const OWNER_INTENT_COOKIE_TTL_MS = 10 * 60 * 1000

const HMAC_DOMAIN = 'owner-intent-cookie-v1'

type Payload = { intent: 'owner'; exp: number }

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
export function buildOwnerIntentCookie(nowMs: number = Date.now()): string {
  const body: Payload = { intent: 'owner', exp: nowMs + OWNER_INTENT_COOKIE_TTL_MS }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

/**
 * `true` solo con firma válida, intención "owner" y sin vencer. Cualquier otro caso
 * (ausente, firma alterada, payload corrupto, vencida) es `false`. Nunca lanza
 * por el valor de la cookie.
 */
export function verifyOwnerIntentCookie(
  value: string | undefined | null,
  nowMs: number = Date.now(),
): boolean {
  if (!value) return false
  const dot = value.indexOf('.')
  if (dot <= 0) return false

  const payload = value.slice(0, dot)
  const a = Buffer.from(value.slice(dot + 1))
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null) return false

  const { intent, exp } = parsed as Record<string, unknown>
  if (intent !== 'owner') return false
  return typeof exp === 'number' && Number.isFinite(exp) && exp > nowMs
}
