import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mocks must be declared before importing the route module.
vi.mock('@/shared/db/client', () => ({
  getSql: vi.fn(),
  getWorkerSql: vi.fn(),
}))
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(),
}))
vi.mock('@/shared/rate-limit/client', () => ({
  getRedis: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}))

import { GET, STATUS_TOKEN_HEADER } from '@/app/api/status/route'
import { getSql, getWorkerSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import { getRedis } from '@/shared/rate-limit/client'
import { captureException } from '@/lib/sentry'

/**
 * Un GET al endpoint. Bajo vitest `NODE_ENV` es 'test', así que sin header el
 * detalle sale igual — que es exactamente lo que asumen los tests de checks de
 * abajo, escritos antes de que el detalle se cerrara (B10).
 */
function pedir(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/status', { headers })
}

/** El pool de workers responde que su rol SÍ puede saltear RLS (caso sano). */
function workerPoolSano() {
  ;(getWorkerSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    vi.fn().mockResolvedValue([{ ok: true }]),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  workerPoolSano()
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.MP_CLIENT_ID = 'set'
  process.env.MP_CLIENT_SECRET = 'set'
  process.env.RESEND_API_KEY = 'set'
  process.env.SENTRY_DSN = 'set'
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(getRedis as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ping: vi.fn().mockResolvedValue('PONG'),
  })
})

describe('GET /api/status', () => {
  it('returns 200 + status=ok when all checks pass', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET(pedir())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    const db = body.checks.find((c: { name: string }) => c.name === 'database')
    expect(db.status).toBe('ok')
    const pgboss = body.checks.find((c: { name: string }) => c.name === 'pg-boss')
    expect(pgboss.status).toBe('ok')
  })

  it('returns 503 + status=down when DB throws', async () => {
    const sqlMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET(pedir())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('down')
    const db = body.checks.find((c: { name: string }) => c.name === 'database')
    expect(db.status).toBe('down')
  })

  it('degrades pg-boss to "ok" on permission denied', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockRejectedValue(new Error('permission denied for schema pgboss')),
    })

    const res = await GET(pedir())
    expect(res.status).toBe(200)
    const body = await res.json()
    const pgboss = body.checks.find((c: { name: string }) => c.name === 'pg-boss')
    expect(pgboss.status).toBe('ok')
  })

  it('reports pg-boss down on real connection error', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    )

    const res = await GET(pedir())
    expect(res.status).toBe(503)
    const body = await res.json()
    const pgboss = body.checks.find((c: { name: string }) => c.name === 'pg-boss')
    expect(pgboss.status).toBe('down')
  })

  it('reports externals as down when env vars missing', async () => {
    delete process.env.MP_CLIENT_ID
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET(pedir())
    const body = await res.json()
    const mp = body.checks.find((c: { name: string }) => c.name === 'mercadopago')
    expect(mp.status).toBe('down')
  })

  it('reports upstash ok on successful ping', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET(pedir())
    expect(res.status).toBe(200)
    const body = await res.json()
    const upstash = body.checks.find((c: { name: string }) => c.name === 'upstash')
    expect(upstash.status).toBe('ok')
  })

  it('reports upstash down (503) when ping throws', async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })
    ;(getRedis as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error('redis unreachable')),
    })

    const res = await GET(pedir())
    expect(res.status).toBe(503)
    const body = await res.json()
    const upstash = body.checks.find((c: { name: string }) => c.name === 'upstash')
    expect(upstash.status).toBe('down')
  })

  it('reports upstash ok (not configured) without 503 when env missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const sqlMock = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlMock)
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })

    const res = await GET(pedir())
    expect(res.status).toBe(200)
    const body = await res.json()
    const upstash = body.checks.find((c: { name: string }) => c.name === 'upstash')
    expect(upstash.status).toBe('ok')
    expect(upstash.note).toMatch(/not configured/i)
  })

  // ─── worker-pool ──────────────────────────────────────────────────────────
  // Modo de falla real: sin `WORKER_DATABASE_URL`, getWorkerSql() cae a
  // DATABASE_URL (turnogol_app, sin BYPASSRLS) y las lecturas cross-tenant
  // devuelven 0 filas SIN error. Nada más en la app se entera.

  function dbYBossSanos() {
    ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    )
    ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      getQueueSize: vi.fn().mockResolvedValue(0),
    })
  }

  it('reporta worker-pool ok cuando el rol puede saltear RLS', async () => {
    dbYBossSanos()

    const res = await GET(pedir())
    expect(res.status).toBe(200)
    const body = await res.json()
    const worker = body.checks.find((c: { name: string }) => c.name === 'worker-pool')
    expect(worker.status).toBe('ok')
  })

  it('503 cuando el rol del pool de workers NO puede saltear RLS', async () => {
    dbYBossSanos()
    ;(getWorkerSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockResolvedValue([{ ok: false }]),
    )

    const res = await GET(pedir())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('down')
    const worker = body.checks.find((c: { name: string }) => c.name === 'worker-pool')
    expect(worker.status).toBe('down')
    // La respuesta es pública: el nombre del rol nunca sale.
    expect(JSON.stringify(worker)).not.toMatch(/turnogol_app|rolbypassrls/)
  })

  it('503 cuando la consulta al pool de workers explota', async () => {
    dbYBossSanos()
    ;(getWorkerSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      vi.fn().mockRejectedValue(new Error('connect ETIMEDOUT')),
    )

    const res = await GET(pedir())
    expect(res.status).toBe(503)
    const body = await res.json()
    const worker = body.checks.find((c: { name: string }) => c.name === 'worker-pool')
    expect(worker.status).toBe('down')
  })

  it('acepta rolsuper además de rolbypassrls', async () => {
    // No es cosmético: el Supabase local y el CI corren como superusuario, cuyo
    // `rolbypassrls` puede figurar en false aunque saltee RLS igual. Sin esa
    // rama en el SQL, este check tumba el gate de readiness del webServer de
    // Playwright y se lleva puesta la suite E2E entera.
    dbYBossSanos()
    const sqlSpy = vi.fn().mockResolvedValue([{ ok: true }])
    ;(getWorkerSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sqlSpy)

    await GET(pedir())

    const consulta = (sqlSpy.mock.calls[0]?.[0] as string[]).join(' ')
    expect(consulta).toMatch(/rolbypassrls/)
    expect(consulta).toMatch(/rolsuper/)
  })

  // ─── encryption-key ───────────────────────────────────────────────────────
  // Presencia no alcanza: en prod la variable ESTABA, con el formato mal, y el
  // único lugar donde se notaba era /api/mp/callback — el complejo autorizaba
  // en MercadoPago y caía en una pantalla de error.

  it.each([
    ['ausente', undefined],
    ['32 chars', 'a'.repeat(32)],
    ['65 hex', 'a'.repeat(65)],
    ['64 chars no-hex', 'z'.repeat(64)],
  ])('503 cuando ENCRYPTION_KEY es %s', async (_caso, key) => {
    dbYBossSanos()
    if (key === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = key

    const res = await GET(pedir())
    expect(res.status).toBe(503)
    const body = await res.json()
    const check = body.checks.find((c: { name: string }) => c.name === 'encryption-key')
    expect(check.status).toBe('down')
    // Respuesta pública: ni la clave ni su longitud salen.
    expect(JSON.stringify(check)).not.toMatch(/aaaa|zzzz|\b32\b|\b65\b/)
  })

  it('encryption-key ok con 64 hex', async () => {
    dbYBossSanos()
    process.env.ENCRYPTION_KEY = 'A1B2C3D4E5F6'.repeat(5) + 'A1B2'

    const res = await GET(pedir())
    expect(res.status).toBe(200)
    const body = await res.json()
    const check = body.checks.find((c: { name: string }) => c.name === 'encryption-key')
    expect(check.status).toBe('ok')
  })

  // ─── storage (R2) ─────────────────────────────────────────────────────────
  // A diferencia de encryption-key, NO tumba el semáforo: sin R2 no se suben
  // imágenes, pero reservas, caja y cobros andan igual.

  it('storage sin configurar: nota visible, pero sigue 200', async () => {
    dbYBossSanos()
    for (const k of [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_PUBLIC_BASE_URL',
    ]) {
      delete process.env[k]
    }

    const res = await GET(pedir())
    expect(res.status).toBe(200)
    const body = await res.json()
    const check = body.checks.find((c: { name: string }) => c.name === 'storage')
    expect(check.status).toBe('ok')
    expect(check.note).toMatch(/not configured/i)
  })

  it('storage configurado: sin nota', async () => {
    dbYBossSanos()
    process.env.R2_ACCOUNT_ID = 'acc'
    process.env.R2_ACCESS_KEY_ID = 'key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
    process.env.R2_BUCKET = 'bucket'
    process.env.R2_PUBLIC_BASE_URL = 'https://media.example.com'

    const res = await GET(pedir())
    const body = await res.json()
    const check = body.checks.find((c: { name: string }) => c.name === 'storage')
    expect(check.status).toBe('ok')
    expect(check.note).toBeUndefined()
  })

  // ─── detalle detrás de token (B10) ────────────────────────────────────────
  // El endpoint es público a propósito (monitor de uptime externo sin
  // credenciales), pero el `checks[]` le contaba a cualquiera QUÉ pieza está
  // caída. El caso que obliga: `upstash: down` anuncia que el rate limiter
  // quedó degradado, o sea publica la ventana para probar contraseñas.
  describe('en producción el detalle exige STATUS_TOKEN', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    /** Producción con un `upstash: down` real esperando a ser filtrado. */
    function prodConUpstashCaido() {
      vi.stubEnv('NODE_ENV', 'production')
      ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      )
      ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        getQueueSize: vi.fn().mockResolvedValue(0),
      })
      ;(getRedis as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ping: vi.fn().mockRejectedValue(new Error('redis unreachable')),
      })
    }

    it('sin token: semáforo sí, detalle no', async () => {
      prodConUpstashCaido()
      vi.stubEnv('STATUS_TOKEN', 'un-token-suficientemente-largo')

      const res = await GET(pedir())
      const body = await res.json()

      // El semáforo sigue siendo público: es el contrato del monitor.
      expect(res.status).toBe(503)
      expect(body.status).toBe('down')
      // Pero no dice QUÉ se cayó.
      expect(body.checks).toBeUndefined()
      expect(JSON.stringify(body)).not.toMatch(/upstash|database|pg-boss|encryption/)
    })

    it('con el token equivocado: tampoco', async () => {
      prodConUpstashCaido()
      vi.stubEnv('STATUS_TOKEN', 'un-token-suficientemente-largo')

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: 'otro-token-cualquiera' }))
      const body = await res.json()

      expect(body.checks).toBeUndefined()
    })

    it('con el token correcto: detalle completo', async () => {
      prodConUpstashCaido()
      vi.stubEnv('STATUS_TOKEN', 'un-token-suficientemente-largo')

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: 'un-token-suficientemente-largo' }))
      const body = await res.json()

      expect(res.status).toBe(503)
      const upstash = body.checks.find((c: { name: string }) => c.name === 'upstash')
      expect(upstash.status).toBe('down')
    })

    it('sin STATUS_TOKEN configurado NO se abre sola: el detalle queda cerrado', async () => {
      // El modo de falla que este caso descarta: implementar el gate como "si no
      // hay token configurado, dejá pasar", que es la variante cómoda y deja
      // producción exactamente como estaba.
      prodConUpstashCaido()
      vi.stubEnv('STATUS_TOKEN', '')

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: '' }))
      const body = await res.json()

      expect(body.checks).toBeUndefined()
    })

    it('fuera de producción el detalle sale sin token', async () => {
      // next dev, CI y el gate de readiness de Playwright: exigirles un token
      // sería ceremonia sin defensa, y romperia la suite E2E entera.
      vi.stubEnv('NODE_ENV', 'development')
      dbYBossSanos()

      const res = await GET(pedir())
      const body = await res.json()

      expect(body.checks).toBeDefined()
    })
  })

  it('falta UNA sola credencial de R2 y ya cuenta como no configurado', async () => {
    // isR2Configured() en r2.ts exige las 5; este check tiene que decir lo
    // mismo, o el payload diria "configurado" mientras el upload falla.
    dbYBossSanos()
    process.env.R2_ACCOUNT_ID = 'acc'
    process.env.R2_ACCESS_KEY_ID = 'key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
    process.env.R2_BUCKET = 'bucket'
    delete process.env.R2_PUBLIC_BASE_URL

    const res = await GET(pedir())
    const body = await res.json()
    const check = body.checks.find((c: { name: string }) => c.name === 'storage')
    expect(check.note).toMatch(/not configured/i)
  })
  // P-12 (docs/qa/P12-worker-caido-2026-08-24.md): el worker estuvo 26 minutos
  // caído en producción y este endpoint contestó `ok` todo el tiempo, porque
  // `checkPgBoss` prueba que la web puede CONECTARSE a pg-boss, no que exista
  // alguien consumiendo la cola. El latido leído desde afuera es lo que
  // convierte esa caída en un 503 que un monitor externo sí puede ver.
  describe('worker-heartbeat', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    /**
     * `getSql` como tagged template: distingue la consulta del latido de
     * cualquier otra (el `SELECT 1` de `checkDb`) mirando el texto, porque un
     * mock que devuelve lo mismo para todo no puede probar nada de esto.
     */
    function sqlConLatido(last: Date | 'ninguno' | 'error') {
      const fn = vi.fn((strings: TemplateStringsArray) => {
        const texto = Array.isArray(strings) ? strings.join(' ') : String(strings)
        if (texto.includes('health-ping')) {
          if (last === 'error') {
            return Promise.reject(new Error('permission denied for schema pgboss'))
          }
          return Promise.resolve([{ last: last === 'ninguno' ? null : last }])
        }
        return Promise.resolve([{ '?column?': 1 }])
      })
      ;(getSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fn)
      ;(getBoss as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        getQueueSize: vi.fn().mockResolvedValue(0),
      })
      return fn
    }

    function latidoHace(minutos: number): Date {
      return new Date(Date.now() - minutos * 60_000)
    }

    const TOKEN = 'un-token-suficientemente-largo'

    function prod() {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('STATUS_TOKEN', TOKEN)
    }

    it('latido fresco: sigue en 200', async () => {
      prod()
      sqlConLatido(latidoHace(3))

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: TOKEN }))
      expect(res.status).toBe(200)
      const body = await res.json()
      const check = body.checks.find((c: { name: string }) => c.name === 'worker-heartbeat')
      expect(check.status).toBe('ok')
    })

    // El caso de P-12 exacto: worker muerto, base y pg-boss impecables.
    it('latido viejo: 503 y reporte a Sentry, aunque el resto esté sano', async () => {
      prod()
      sqlConLatido(latidoHace(26))

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: TOKEN }))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.status).toBe('down')
      const check = body.checks.find((c: { name: string }) => c.name === 'worker-heartbeat')
      expect(check.status).toBe('down')
      // Ni la antigüedad ni qué se midió salen en una respuesta pública: el
      // detalle va a Sentry, que tiene dueño.
      expect(check.error).toBe('No se pudo verificar.')
      expect(JSON.stringify(check)).not.toMatch(/min|stale|health-ping/i)
      expect(captureException).toHaveBeenCalled()
    })

    // Tres ciclos de 5 minutos: un deploy del worker se saltea uno y no pasa nada.
    it('a los 12 minutos todavía no grita', async () => {
      prod()
      sqlConLatido(latidoHace(12))

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: TOKEN }))
      expect(res.status).toBe(200)
    })

    // Fail-open: una alarma que no se puede apagar entrena a ignorar alarmas.
    it('sin ningún latido registrado no inventa una caída', async () => {
      prod()
      sqlConLatido('ninguno')

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: TOKEN }))
      expect(res.status).toBe(200)
      const body = await res.json()
      const check = body.checks.find((c: { name: string }) => c.name === 'worker-heartbeat')
      expect(check.status).toBe('ok')
      expect(check.note).toMatch(/no heartbeat/i)
    })

    it('si no puede leer el latido tampoco tumba el semáforo', async () => {
      prod()
      sqlConLatido('error')

      const res = await GET(pedir({ [STATUS_TOKEN_HEADER]: TOKEN }))
      expect(res.status).toBe(200)
      const body = await res.json()
      const check = body.checks.find((c: { name: string }) => c.name === 'worker-heartbeat')
      expect(check.status).toBe('ok')
    })

    // Sin esto, un latido viejo de la última vez que alguien corrió los workers
    // deja /api/status en 503 para siempre en local, y el gate de readiness de
    // Playwright frena la suite e2e entera antes de arrancar.
    it('fuera de producción no evalúa la antigüedad', async () => {
      const fn = sqlConLatido(latidoHace(600))

      const res = await GET(pedir())
      expect(res.status).toBe(200)
      const body = await res.json()
      const check = body.checks.find((c: { name: string }) => c.name === 'worker-heartbeat')
      expect(check.status).toBe('ok')
      // Ni siquiera consultó: es un check que no existe fuera de producción.
      const consultas = fn.mock.calls.map((c) => (Array.isArray(c[0]) ? c[0].join(' ') : ''))
      expect(consultas.some((q) => q.includes('health-ping'))).toBe(false)
    })
  })
})
