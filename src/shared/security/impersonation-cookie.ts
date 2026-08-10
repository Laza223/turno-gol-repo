import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Cookie de impersonación del SuperAdmin (spec §6).
 *
 * Patrón HMAC: payload base64url + firma SHA-256, comparación en tiempo
 * constante. El payload es estructurado ({ tenantId, systemAdminId, exp }).
 *
 * SECRET — se usa `IMPERSONATION_COOKIE_SECRET` (server-only). NO usar
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: ese valor viaja al bundle del browser
 * (prefijo NEXT_PUBLIC_), así que como secreto HMAC haría la cookie FORJEABLE
 * por cualquiera. La firma acá es defensa en profundidad: la barrera real
 * sigue siendo el JWT de system_admin que el guard exige aparte (una cookie
 * válida sin sesión system_admin no sirve).
 *
 * Este módulo es PURO (solo node:crypto): lo importan workers, audit.ts y tests
 * sin arrastrar `next/headers`. La lectura de la cookie del request vive en
 * `@/modules/auth/impersonation.server.ts`.
 *
 * Vive en `@/shared/security` y no en `@/modules/auth` porque es un códec de
 * cookie firmada, no lógica de negocio: `@/shared/db/audit.ts` (infraestructura)
 * lo necesita, y con el archivo del lado de dominio esa arista quedaba como una
 * violación de capas que en realidad era un archivo mal ubicado (B6).
 */

export const IMPERSONATION_COOKIE_NAME = 'tg_sa_impersonate'

/** TTL de la sesión impersonada: 1 hora (spec §6). */
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000

export type ImpersonationPayload = {
  tenantId: string
  systemAdminId: string
  /** Epoch en milisegundos en que la cookie deja de ser válida. */
  exp: number
}

function getCookieSecret(): string {
  const s = process.env.IMPERSONATION_COOKIE_SECRET
  if (!s || s.length < 16) {
    throw new Error('IMPERSONATION_COOKIE_SECRET missing or shorter than 16 chars')
  }
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', getCookieSecret()).update(payload).digest('base64url')
}

function isUuidLike(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
}

export type BuildImpersonationInput = {
  tenantId: string
  systemAdminId: string
}

/**
 * Construye el valor de la cookie firmada. `nowMs` es inyectable para tests; en
 * runtime usa Date.now() (la regla anti-Date.now() es solo de los scripts de
 * Workflow, no del código de la app).
 */
export function buildImpersonationCookie(
  input: BuildImpersonationInput,
  nowMs: number = Date.now(),
): string {
  const body: ImpersonationPayload = {
    tenantId: input.tenantId,
    systemAdminId: input.systemAdminId,
    exp: nowMs + IMPERSONATION_TTL_MS,
  }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

/**
 * Verifica firma + expiración y devuelve el payload, o null si la cookie es
 * inválida por cualquier motivo (firma alterada, payload corrupto, expirada,
 * campos faltantes). Nunca lanza.
 */
export function verifyImpersonationCookie(
  value: string,
  nowMs: number = Date.now(),
): ImpersonationPayload | null {
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

  const { tenantId, systemAdminId, exp } = parsed as Record<string, unknown>
  if (!isUuidLike(tenantId) || !isUuidLike(systemAdminId)) return null
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
  if (exp <= nowMs) return null

  return { tenantId, systemAdminId, exp }
}
