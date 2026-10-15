import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Candado del cableado: los TRES clientes de `client.ts` (pool de la app, pool
// worker y el cliente descartable del super-admin) tienen que llevar el corte de
// conexiones mudas cuando corren dentro de Next. Si alguien saca el
// `...silentConnectionOptions(...)` de uno, ese pool vuelve a poder colgar el
// servidor (2026-10-15) y ningún otro test lo nota.

const h = vi.hoisted(() => ({ postgres: vi.fn() }))

vi.mock('postgres', () => ({ default: h.postgres }))
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => ({}) }))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))

type PostgresOptions = { socket?: unknown; connect_timeout?: number }

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME

function optionsOfCall(index: number): PostgresOptions {
  return h.postgres.mock.calls[index]?.[1] as PostgresOptions
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  delete (globalThis as { __turnogolSql?: unknown }).__turnogolSql
  delete (globalThis as { __turnogolWorkerSql?: unknown }).__turnogolWorkerSql
  h.postgres.mockImplementation(() => ({
    options: { serializers: {} as Record<string, unknown> },
    end: vi.fn(async () => {}),
  }))
})

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.NEXT_RUNTIME
  else process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME
})

describe('client.ts — cada cliente lleva el corte de conexiones mudas en la web', () => {
  it('pool de la app, pool worker y cliente descartable', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    const client = await import('@/shared/db/client')

    client.getSql()
    client.getWorkerSql()
    await client.withDisposableWorkerDb(1_000, async () => null)

    expect(h.postgres).toHaveBeenCalledTimes(3)
    for (const index of [0, 1, 2]) {
      expect(typeof optionsOfCall(index).socket).toBe('function')
      expect(optionsOfCall(index).connect_timeout).toBe(10)
    }
  })

  it('fuera de Next (worker de Railway) los pools quedan como estaban', async () => {
    delete process.env.NEXT_RUNTIME
    const client = await import('@/shared/db/client')

    client.getSql()
    client.getWorkerSql()

    expect(optionsOfCall(0).socket).toBeUndefined()
    expect(optionsOfCall(1).socket).toBeUndefined()
  })
})
