import { describe, expect, it, vi, beforeEach } from 'vitest'

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

import { GET } from '@/app/api/status/route'
import { getSql, getWorkerSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import { getRedis } from '@/shared/rate-limit/client'

/** El pool de workers responde que su rol SÍ puede saltear RLS (caso sano). */
function workerPoolSano() {
  ;(getWorkerSql as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    vi.fn().mockResolvedValue([{ ok: true }]),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  workerPoolSano()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    const res = await GET()
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

    await GET()

    const consulta = (sqlSpy.mock.calls[0]?.[0] as string[]).join(' ')
    expect(consulta).toMatch(/rolbypassrls/)
    expect(consulta).toMatch(/rolsuper/)
  })
})
