import { beforeEach, describe, expect, it, vi } from 'vitest'

// Candado del cableado: los TRES clientes de `client.ts` (pool de la app, pool
// worker y el cliente descartable del super-admin) llevan el corte de queries
// colgadas cuando corren dentro de Next. Si alguien saca el
// `...dbConnectionOptions(...)` de uno, ese pool vuelve a poder colgar el
// servidor (2026-10-15) y ningún otro test lo nota. Y con el corte, el TLS lo
// negocia la fábrica: postgres.js tiene que recibir `ssl: false` o envolvería el
// socket otra vez (el #426 murió por cortar debajo de ese envoltorio).

const h = vi.hoisted(() => ({ postgres: vi.fn() }))

vi.mock('postgres', () => ({ default: h.postgres }))
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => ({}) }))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))

type PostgresOptions = { ssl?: unknown; socket?: unknown; connect_timeout?: number }

const REMOTE_URL = 'postgres://u:p@pooler.example.com:6543/postgres'

function optionsOfCall(index: number): PostgresOptions {
  return h.postgres.mock.calls[index]?.[1] as PostgresOptions
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  delete (globalThis as { __turnogolSql?: unknown }).__turnogolSql
  delete (globalThis as { __turnogolWorkerSql?: unknown }).__turnogolWorkerSql
  vi.stubEnv('DATABASE_URL', REMOTE_URL)
  vi.stubEnv('WORKER_DATABASE_URL', REMOTE_URL)
  h.postgres.mockImplementation(() => ({
    options: { serializers: {} as Record<string, unknown> },
    end: vi.fn(async () => {}),
  }))
})

describe('client.ts — cada cliente lleva el corte de queries colgadas en la web', () => {
  it('pool de la app, pool worker y cliente descartable', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const client = await import('@/shared/db/client')

    client.getSql()
    client.getWorkerSql()
    await client.withDisposableWorkerDb(1_000, async () => null)

    expect(h.postgres).toHaveBeenCalledTimes(3)
    for (const index of [0, 1, 2]) {
      expect(typeof optionsOfCall(index).socket).toBe('function')
      expect(optionsOfCall(index).ssl).toBe(false)
    }
    expect(optionsOfCall(0).connect_timeout).toBe(10)
    expect(optionsOfCall(1).connect_timeout).toBe(10)
  })

  it('fuera de Next (worker de Railway) los pools quedan con el TLS de siempre', async () => {
    vi.stubEnv('NEXT_RUNTIME', '')
    const client = await import('@/shared/db/client')

    client.getSql()
    client.getWorkerSql()

    for (const index of [0, 1]) {
      expect(optionsOfCall(index).socket).toBeUndefined()
      expect(optionsOfCall(index).ssl).toMatchObject({ rejectUnauthorized: true })
    }
  })
})
