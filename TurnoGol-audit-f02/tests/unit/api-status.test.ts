import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mocks must be declared before importing the route module.
vi.mock('@/shared/db/client', () => ({
  getSql: vi.fn(),
}))
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(),
}))

import { GET } from '@/app/api/status/route'
import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MP_CLIENT_ID = 'set'
  process.env.MP_CLIENT_SECRET = 'set'
  process.env.RESEND_API_KEY = 'set'
  process.env.SENTRY_DSN = 'set'
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
})
