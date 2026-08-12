import { getSql, getWorkerSql } from '@/shared/db/client'
import { ENCRYPTION_KEY_PATTERN } from '@/shared/env'
import { getBoss } from '@/shared/jobs/boss'
import { getRedis } from '@/shared/rate-limit/client'
import { secretMatches } from '@/shared/security/secret-compare'
import { captureException } from '@/lib/sentry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Público y sin auth (uptime monitor externo, doc17/doc19): el detalle de la
// excepción NUNCA sale en la respuesta (audit_report.md 3-13) — se loguea acá
// para diagnóstico interno y el caller solo recibe este texto genérico.
const GENERIC_CHECK_ERROR = 'No se pudo verificar.'

/** Header con el que un caller de confianza pide el detalle de los checks. */
export const STATUS_TOKEN_HEADER = 'x-status-token'

type CheckStatus = 'ok' | 'degraded' | 'down'

type Check = {
  name: string
  status: CheckStatus
  latencyMs?: number
  error?: string
  note?: string
}

async function checkDb(): Promise<Check> {
  const t0 = Date.now()
  try {
    const sql = getSql()
    await sql`SELECT 1`
    return { name: 'database', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    captureException(err)
    return { name: 'database', status: 'down', error: GENERIC_CHECK_ERROR }
  }
}

async function checkPgBoss(): Promise<Check> {
  const t0 = Date.now()
  try {
    const boss = await getBoss()
    try {
      await boss.getQueueSize('send-email')
    } catch (innerErr) {
      const msg = String((innerErr as Error).message ?? innerErr).toLowerCase()
      if (msg.includes('permission denied') || msg.includes('does not exist')) {
        // Pool alive; role lacks introspection privilege — that's by design in prod.
        return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
      }
      throw innerErr
    }
    return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    captureException(err)
    return { name: 'pg-boss', status: 'down', error: GENERIC_CHECK_ERROR }
  }
}

/**
 * Fails if the pool que usan las lecturas cross-tenant (`getWorkerSql()`,
 * DSN `WORKER_DATABASE_URL`) entra con un rol que NO puede saltear RLS.
 *
 * Por qué vive acá y no solo en launch-check: `getWorkerSql()` cae a
 * `DATABASE_URL` cuando `WORKER_DATABASE_URL` no está seteada (client.ts:150),
 * y en producción ese DSN es `turnogol_app`, restringido a propósito. El
 * resultado no es un error: los barridos y las búsquedas cross-tenant del
 * panel web devuelven CERO filas, en silencio, para siempre. Los workers de
 * Railway ya se protegen con `assertWorkerDbVisibility()` al arrancar; la app
 * de Next no tenía ninguna red — y el síntoma es invisible mientras no haya
 * complejos cargados, justo cuando nadie está mirando.
 *
 * `rolsuper` cuenta como aprobado además de `rolbypassrls`: un superusuario
 * saltea RLS por definición aunque el atributo figure en false, y es el rol
 * con el que corren el Supabase local y el CI. Sin esa rama, este check
 * tumbaría el gate de readiness del webServer de Playwright y se llevaría
 * puesta la suite E2E entera. La identidad exacta del login (que el DSN no
 * apunte al owner de las tablas) la sigue verificando `roleIdentityCheck` en
 * launch-check, que es donde corresponde.
 */
async function checkWorkerPool(): Promise<Check> {
  const t0 = Date.now()
  try {
    const sql = getWorkerSql()
    const rows = await sql<{ ok: boolean }[]>`
      SELECT (rolbypassrls OR rolsuper) AS ok
      FROM pg_roles
      WHERE rolname = current_user
    `
    if (rows[0]?.ok !== true) {
      // El nombre del rol NO sale en la respuesta (es pública): se loguea para
      // diagnóstico, igual que el resto de los checks.
      captureException(
        new Error(
          'worker pool role cannot bypass RLS — cross-tenant reads would silently ' +
            'return 0 rows. Set WORKER_DATABASE_URL to the turnogol_worker DSN.',
        ),
      )
      return { name: 'worker-pool', status: 'down', error: GENERIC_CHECK_ERROR }
    }
    return { name: 'worker-pool', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    captureException(err)
    return { name: 'worker-pool', status: 'down', error: GENERIC_CHECK_ERROR }
  }
}

async function checkUpstash(): Promise<Check> {
  const t0 = Date.now()
  // Not configured (dev/E2E): rate limiting degrades gracefully (enforce()
  // fail-open/closed). Report ok so the health gate stays 200 — launch-check
  // REQUIRED_ENV already guarantees Upstash is configured for production.
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      name: 'upstash',
      status: 'ok',
      note: 'not configured (rate limiting degrades gracefully)',
    }
  }
  try {
    const redis = getRedis()
    await redis.ping()
    return { name: 'upstash', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    captureException(err)
    return { name: 'upstash', status: 'down', error: GENERIC_CHECK_ERROR }
  }
}

function checkConfigured(): Check[] {
  const envs: Record<string, boolean> = {
    mercadopago: !!process.env.MP_CLIENT_ID && !!process.env.MP_CLIENT_SECRET,
    email: !!process.env.RESEND_API_KEY,
    sentry: !!process.env.SENTRY_DSN,
  }
  return Object.entries(envs).map(([name, ok]) => ({
    name,
    status: ok ? ('ok' as const) : ('down' as const),
  }))
}

/**
 * Fails si `ENCRYPTION_KEY` no tiene el formato que exige `encrypt.ts`.
 *
 * Presencia no alcanza — de ahí que no viva en `checkConfigured` de arriba. En
 * producción la variable ESTABA, pero con un formato inválido, y el único
 * lugar donde eso se manifestaba era `/api/mp/callback`: el complejo autorizaba
 * a TurnoGol en MercadoPago y aterrizaba en una pantalla de error, con la
 * conexión de su cuenta de cobro a medio hacer. Un camino que solo se recorre
 * una vez por complejo, durante el alta, y que por eso nadie mira.
 *
 * Es fatal a propósito: sin esta clave no se pueden guardar los tokens de MP,
 * o sea que ningún complejo puede cobrar señas.
 */
function checkEncryptionKey(): Check {
  const key = process.env.ENCRYPTION_KEY
  if (!key || !ENCRYPTION_KEY_PATTERN.test(key)) {
    // Ni la clave ni su longitud salen en la respuesta, que es pública.
    return { name: 'encryption-key', status: 'down', error: GENERIC_CHECK_ERROR }
  }
  return { name: 'encryption-key', status: 'ok' }
}

/**
 * Reporta si R2 (fotos de canchas y del complejo) está configurado.
 *
 * NO es fatal, y la diferencia con `encryption-key` es deliberada: sin R2 no se
 * pueden subir imágenes, pero todo lo demás —reservas, caja, cobros— anda.
 * Tumbar el semáforo entero por eso le haría gritar al monitor de uptime que el
 * sitio está caído cuando no lo está. Mismo criterio que `upstash` arriba: se
 * expone en el payload con una nota, para que se pueda consultar sin adivinar.
 */
function checkStorage(): Check {
  const configured =
    !!process.env.R2_ACCOUNT_ID &&
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET &&
    !!process.env.R2_PUBLIC_BASE_URL
  return configured
    ? { name: 'storage', status: 'ok' }
    : { name: 'storage', status: 'ok', note: 'not configured (image upload disabled)' }
}

function overallFrom(checks: Check[]): CheckStatus {
  if (checks.every((c) => c.status === 'ok')) return 'ok'
  if (checks.some((c) => c.status === 'down')) return 'down'
  return 'degraded'
}

/**
 * ¿Este caller puede ver el detalle por subsistema, o solo el semáforo?
 *
 * B10 — el endpoint es público a propósito (lo consulta un monitor de uptime
 * externo sin credenciales), pero el `checks[]` completo le contaba a cualquiera
 * qué pieza está caída. El caso que obliga a cerrarlo no es de principio:
 * `upstash: down` anuncia que el rate limiter quedó degradado, o sea publica la
 * ventana exacta para probar contraseñas y magic links a mano suelta. Lo mismo,
 * más suave, con `mercadopago`/`email` sin configurar (deploy a medio hacer).
 *
 * El semáforo (`status` + 200/503) SÍ sigue siendo público: es el contrato
 * mínimo del monitor y no dice qué subsistema falló.
 *
 * Fuera de producción devuelve el detalle sin configurar nada: `next dev`, CI y
 * el gate de readiness de Playwright son justamente donde se lo mira para
 * diagnosticar, y exigirles un token sería ceremonia sin defensa (ese servidor
 * no está expuesto). En cualquier artefacto buildeado —`next build` fija
 * NODE_ENV=production, también en los previews— el detalle exige `STATUS_TOKEN`.
 */
function canSeeDetail(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const expected = process.env.STATUS_TOKEN
  if (!expected) return false
  const provided = req.headers.get(STATUS_TOKEN_HEADER)
  return provided !== null && secretMatches(provided, expected)
}

export async function GET(req: Request): Promise<Response> {
  const [db, workerPool, pgboss, upstash] = await Promise.all([
    checkDb(),
    checkWorkerPool(),
    checkPgBoss(),
    checkUpstash(),
  ])
  const checks: Check[] = [
    db,
    workerPool,
    pgboss,
    upstash,
    checkEncryptionKey(),
    checkStorage(),
    ...checkConfigured(),
  ]
  const status = overallFrom(checks)
  const httpStatus = status === 'ok' ? 200 : 503
  const timestamp = new Date().toISOString()
  const body = canSeeDetail(req) ? { status, checks, timestamp } : { status, timestamp }
  return Response.json(body, { status: httpStatus })
}
