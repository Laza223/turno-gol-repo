import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-09-20: "Ir a mi panel" del super admin mandaba a /super-admin y la
// página quedaba cargando hasta el timeout de 300 s de Vercel. La única espera
// del dashboard que no era una query SQL era `getBoss()` (el `start()` de
// pg-boss arranca supervisor, cron y pollers en el proceso web). Estos tests
// fijan que las colas se leen con UNA query por el pool worker, sin pg-boss, y
// que si esa lectura falla o no vuelve el dashboard igual carga.
//
// 2026-09-21: sacar pg-boss no alcanzó — en producción la que se colgaba era la
// query del MRR, la única del pool worker con un parámetro enlazado (`status =
// $1`): con `prepare: false` postgres.js la manda en dos tiempos (Parse +
// Describe + Flush y espera la respuesta), y las conexiones quedaban `active`/
// `ClientRead` para siempre. El segundo bloque de abajo lo fija.

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  getWorkerDb: vi.fn(),
  getQueueDepths: vi.fn(),
  workerExecute: vi.fn(),
  appExecute: vi.fn(),
}))

// `withDisposableWorkerDb` abre su propio cliente worker: acá entrega el fake de
// `h.getWorkerDb`. El tope del cliente se respeta para que un cuelgue se vea.
vi.mock('@/shared/db/client', () => ({
  getDb: h.getDb,
  withDisposableWorkerDb: (timeoutMs: number, fn: (db: unknown) => Promise<unknown>) =>
    Promise.race([
      fn(h.getWorkerDb()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]),
}))
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

// La de profundidad (`AS depth`); la de jobs fallidos (`AS failed`) es otra y devuelve vacío.
const isQueueQuery = (query: unknown) =>
  sqlText(query).includes('pgboss_v12.job') && sqlText(query).includes('AS depth')

beforeEach(() => {
  vi.clearAllMocks()
  // Las lecturas de pg-boss van por el pool de la APP (`getDb`): las tablas son de turnogol_app.
  h.getDb.mockReturnValue({ ...makeChain([]), execute: h.appExecute })
  h.appExecute.mockImplementation(async (query: unknown) =>
    isQueueQuery(query) ? [{ name: 'send-email', depth: 3 }] : [],
  )
  h.getWorkerDb.mockReturnValue({
    ...makeChain([{ mrr: '0' }]),
    execute: h.workerExecute,
  })
  // Por defecto el embudo (analytics_events) devuelve vacío; cada test decide qué pasa con las colas.
  h.workerExecute.mockImplementation(async () => [])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getDashboardData — profundidad de colas', () => {
  it('la lee con una query por el pool de la app (no el worker) y NO arranca pg-boss', async () => {
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    const data = await getDashboardData()

    expect(data.queues).toEqual([
      { queue: 'send-email', depth: 3 },
      // Una cola sin filas pendientes cuenta 0, (no hay getQueueSize en la 12).
      { queue: 'push-send', depth: 0 },
    ])
    expect(h.getQueueDepths).not.toHaveBeenCalled()
  })

  it('si la query de colas falla, degrada a "no disponible" y el resto del dashboard carga', async () => {
    h.getWorkerDb.mockReturnValue({
      ...makeChain([{ mrr: '350000' }]),
      execute: h.workerExecute,
    })
    h.getDb.mockReturnValue({
      ...makeChain([]),
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
    h.getDb.mockReturnValue({
      ...makeChain([]),
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

describe('getDashboardData — MRR', () => {
  it('filtra por estado con un literal, sin parámetro enlazado', async () => {
    const wheres: unknown[] = []
    const chain = makeChain([{ mrr: '0' }])
    chain.where = (condition: unknown) => {
      wheres.push(condition)
      return chain
    }
    h.getWorkerDb.mockReturnValue({ ...chain, execute: h.workerExecute })
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    await getDashboardData()

    // `eq(col, 'active')` enlazaría un Param y el texto quedaría " = ": el literal es lo que evita el describe-first.
    expect(sqlText(wheres[0])).toContain("'active'")
  })

  it('si la query del MRR no vuelve nunca, el dashboard carga igual con el MRR en null', async () => {
    vi.useFakeTimers()
    const hanging = makeChain([])
    hanging.then = () => undefined
    h.getWorkerDb.mockReturnValue({ ...hanging, execute: h.workerExecute })
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    const pending = getDashboardData()
    await vi.advanceTimersByTimeAsync(5_100)
    const data = await pending

    // Nunca $0: un MRR que no se pudo leer no puede mostrarse como cero.
    expect(data.mrrCents).toBeNull()
    expect(data.queues).toEqual([
      { queue: 'send-email', depth: 3 },
      { queue: 'push-send', depth: 0 },
    ])
  })
})

describe('getDashboardData — embudo de onboarding', () => {
  // 2026-10-15: el embudo era la única lectura del pool worker sin tope. Con el
  // pool de la instancia comido por queries colgadas, no volvía nunca y la page
  // caía a los 15 s — "/super-admin queda cargando".
  it('si las queries del embudo no vuelven nunca, el dashboard carga igual con el embudo en null', async () => {
    vi.useFakeTimers()
    h.workerExecute.mockImplementation(() => new Promise<never>(() => {}))
    const { getDashboardData } = await import('@/modules/super-admin/dashboard.service')

    const pending = getDashboardData()
    await vi.advanceTimersByTimeAsync(8_100)
    const data = await pending

    // Nunca un embudo en cero inventado: no leído = null, y la vista lo dice.
    expect(data.onboardingFunnel).toBeNull()
    expect(data.mrrCents).toBe(0)
    expect(data.queues).toEqual([
      { queue: 'send-email', depth: 3 },
      { queue: 'push-send', depth: 0 },
    ])
  })
})
