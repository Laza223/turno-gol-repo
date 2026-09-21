import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-09-20: "Ir a mi panel" del super admin mandaba a /super-admin y la
// página quedaba cargando hasta el timeout de 300 s de Vercel. La única espera
// del dashboard que no era una query SQL era `getBoss()` (el `start()` de
// pg-boss arranca supervisor, cron y pollers en el proceso web). Estos tests
// fijan que las colas se leen con UNA query por el pool worker, sin pg-boss, y
// que si esa lectura falla o no vuelve el dashboard igual carga.

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  getWorkerDb: vi.fn(),
  getQueueDepths: vi.fn(),
  workerExecute: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({ getDb: h.getDb, getWorkerDb: h.getWorkerDb }))
vi.mock('@/shared/jobs/dlq', () => ({ ALL_QUEUES: ['send-email', 'push-send'] }))
vi.mock('@/shared/jobs/queue-stats', () => ({ getQueueDepths: h.getQueueDepths }))

type FakeRow = Record<string, unknown>

// Query builder encadenable y "thenable": cubre lo que llama el dashboard sobre
// getDb() (tenants, webhooks) y sobre getWorkerDb() (MRR).
function makeChain(rows: FakeRow[]) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (onfulfilled: (v: FakeRow[]) => unknown, onrejected?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onfulfilled, onrejected),
  }
  return chain
}

/** Texto plano de un `sql\`…\`` de drizzle, para distinguir la query de colas de las del embudo. */
function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? []
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value
      return Array.isArray(value) ? value.join('') : ''
    })
    .join('')
}

const isQueueQuery = (query: unknown) => sqlText(query).includes('pgboss.job')

beforeEach(() => {
  vi.clearAllMocks()
  h.getDb.mockReturnValue(makeChain([]))
  h.getWorkerDb.mockReturnValue({
    ...makeChain([{ mrr: '0' }]),
    execute: h.workerExecute,
  })
  // Por defecto el embudo (analytics_events) devuelve vacío; cada test decide qué pasa con las colas.
  h.workerExecute.mockImplementation(async (query: unknown) =>
    isQueueQuery(query) ? [{ name: 'send-email', depth: 3 }] : [],
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getDashboardData — profundidad de colas', () => {
  it('la lee con una query por el pool worker y NO arranca pg-boss', async () => {
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    const data = await getDashboardData()

    expect(data.queues).toEqual([
      { queue: 'send-email', depth: 3 },
      // Una cola sin filas pendientes cuenta 0, igual que boss.getQueueSize.
      { queue: 'push-send', depth: 0 },
    ])
    expect(h.getQueueDepths).not.toHaveBeenCalled()
  })

  it('si la query de colas falla, degrada a "no disponible" y el resto del dashboard carga', async () => {
    h.getWorkerDb.mockReturnValue({
      ...makeChain([{ mrr: '350000' }]),
      execute: vi.fn(async (query: unknown) => {
        if (isQueueQuery(query)) throw new Error('permission denied for table job')
        return []
      }),
    })
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    const data = await getDashboardData()

    expect(data.queues).toEqual([
      { queue: 'send-email', depth: null, error: 'unavailable' },
      { queue: 'push-send', depth: null, error: 'unavailable' },
    ])
    expect(data.mrrCents).toBe(350000)
  })

  it('si la query de colas no vuelve nunca, el dashboard carga igual pasado el tope', async () => {
    vi.useFakeTimers()
    h.getWorkerDb.mockReturnValue({
      ...makeChain([{ mrr: '0' }]),
      execute: vi.fn((query: unknown) =>
        isQueueQuery(query) ? new Promise<never>(() => {}) : Promise.resolve([]),
      ),
    })
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    const pending = getDashboardData()
    await vi.advanceTimersByTimeAsync(4_100)
    const data = await pending

    expect(data.queues.every((q) => q.depth === null && q.error === 'unavailable')).toBe(true)
  })
})
