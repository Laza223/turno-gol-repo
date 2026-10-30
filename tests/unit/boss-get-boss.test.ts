import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

/**
 * `getBoss()`: arranque single-flight y rol (productor en la web, worker en
 * Railway). `pg-boss` va mockeado: se mide CUÁNTAS instancias se crean, con qué
 * opciones y qué pasa cuando `start()` falla o se cuelga.
 */
type Fake = {
  config: {
    supervise?: boolean
    schedule?: boolean
    registerInstance?: boolean
    queueCacheIntervalSeconds?: number
    bamIntervalSeconds?: number
    schema?: string
    createSchema?: boolean
    connectionTimeoutMillis?: number
  }
  start: Mock
  stop: Mock
}
const h = vi.hoisted(() => ({
  made: [] as Fake[],
  start: async (): Promise<void> => {},
  ensure: async (..._args: unknown[]): Promise<void> => {},
  calls: [] as string[],
}))

vi.mock('@/shared/jobs/ensure-queues', () => ({
  ensureQueues: (...args: unknown[]) => {
    h.calls.push('ensureQueues:' + String(args[1]))
    return h.ensure(...args)
  },
}))

vi.mock('pg-boss', () => ({
  PgBoss: class FakeBoss {
    config: Fake['config']
    start = vi.fn(() => {
      h.calls.push('start')
      return h.start()
    })
    stop = vi.fn(async () => {})
    on = vi.fn()
    constructor(config: Fake['config']) {
      this.config = config
      h.made.push(this)
    }
  },
}))
vi.mock('@/shared/lib/logger', () => ({ logger: { error: vi.fn() } }))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

// El global de dev sobrevive a resetModules y, con un solo hilo, pasa a otros archivos.
const clearDevGlobal = () => Reflect.deleteProperty(globalThis, '__turnogolBossState')

beforeEach(() => {
  vi.resetModules()
  h.made.length = 0
  h.start = async () => {}
  h.ensure = async () => {}
  h.calls.length = 0
  clearDevGlobal()
})
afterEach(() => {
  vi.useRealTimers()
  clearDevGlobal()
})

const load = async () => (await import('@/shared/jobs/boss')).getBoss

describe('getBoss', () => {
  it('llamadas simultáneas mientras arranca comparten UN solo new PgBoss y UN start', async () => {
    const gate = deferred()
    h.start = () => gate.promise
    const getBoss = await load()
    const [a, b] = [getBoss(), getBoss()]
    gate.resolve()
    expect(await a).toBe(await b)
    expect(h.made).toHaveLength(1)
    expect(h.made[0].start).toHaveBeenCalledTimes(1)
  })

  it('si start() falla: todos los que esperaban rechazan, se cierra el pool a medias y la siguiente reintenta', async () => {
    h.start = async () => {
      throw new Error('boom')
    }
    const getBoss = await load()
    const results = await Promise.allSettled([getBoss(), getBoss()])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(h.made).toHaveLength(1)
    expect(h.made[0].stop).toHaveBeenCalledWith({ graceful: false })

    h.start = async () => {}
    expect(await getBoss()).toBe(h.made[1])
    expect(h.made).toHaveLength(2)
  })

  it('productor: un start() que se CUELGA rechaza al vencer el tope y la siguiente arranca una instancia nueva', async () => {
    const getBoss = await load()
    vi.useFakeTimers()
    h.start = () => new Promise<void>(() => {})
    const hung = expect(getBoss()).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(15_000)
    await hung
    expect(h.made[0].stop).toHaveBeenCalledWith({ graceful: false })

    h.start = async () => {}
    expect(await getBoss()).toBe(h.made[1])
    expect(h.made).toHaveLength(2)
  })

  it('worker: sin tope de arranque, como hoy', async () => {
    const gate = deferred()
    h.start = () => gate.promise
    const getBoss = await load()
    vi.useFakeTimers()
    const worker = getBoss('worker')
    await vi.advanceTimersByTimeAsync(60_000)
    gate.resolve()
    expect(await worker).toBe(h.made[0])
    expect(h.made).toHaveLength(1)
  })

  it('productor: ni supervisa, ni agenda, ni se registra, con intervalos altos y tope de conexión', async () => {
    const getBoss = await load()
    await getBoss('producer')
    expect(h.made[0].config).toMatchObject({
      supervise: false,
      schedule: false,
      registerInstance: false,
      queueCacheIntervalSeconds: 3600,
      bamIntervalSeconds: 3600,
      connectionTimeoutMillis: 10_000,
    })
  })

  it('worker: defaults de la 12 (no pasa ninguna de las opciones del productor)', async () => {
    const getBoss = await load()
    await getBoss('worker')
    const { config } = h.made[0]
    for (const key of [
      'supervise',
      'schedule',
      'registerInstance',
      'queueCacheIntervalSeconds',
      'bamIntervalSeconds',
      'connectionTimeoutMillis',
    ] as const) {
      expect(config).not.toHaveProperty(key)
    }
  })

  it.each(['producer', 'worker'] as const)(
    'rol %s: schema pgboss_v12 y createSchema false (turnogol_app no crea schemas)',
    async (role) => {
      const getBoss = await load()
      await getBoss(role)
      expect(h.made[0].config).toMatchObject({ schema: 'pgboss_v12', createSchema: false })
    },
  )

  it('ensureQueues corre DESPUÉS de start() y con el rol, antes de resolver', async () => {
    const getBoss = await load()
    await getBoss('worker')
    expect(h.calls).toEqual(['start', 'ensureQueues:worker'])
  })

  it('si ensureQueues falla: rechaza, cierra el pool y no queda memoizado', async () => {
    h.ensure = async () => {
      throw new Error('no queue')
    }
    const getBoss = await load()
    await expect(getBoss()).rejects.toThrow('no queue')
    expect(h.made[0].stop).toHaveBeenCalledWith({ graceful: false })
    h.ensure = async () => {}
    expect(await getBoss()).toBe(h.made[1])
  })

  it('sin argumentos es productor', async () => {
    const getBoss = await load()
    await getBoss()
    expect(h.made[0].config).toMatchObject({ supervise: false, schedule: false })
    expect(h.calls).toEqual(['start', 'ensureQueues:producer'])
  })

  it('pedir worker con un productor creado o arrancando falla fuerte y no crea otra instancia', async () => {
    const gate = deferred()
    h.start = () => gate.promise
    const getBoss = await load()
    const producer = getBoss()
    await expect(getBoss('worker')).rejects.toThrow(/worker.*producer/s)
    gate.resolve()
    await producer
    await expect(getBoss('worker')).rejects.toThrow(/worker.*producer/s)
    expect(h.made).toHaveLength(1)
  })

  it('dev: una recarga del módulo (HMR) reutiliza la instancia en vez de abrir otra', async () => {
    const first = await (await load())()
    vi.resetModules()
    expect(await (await load())()).toBe(first)
    expect(h.made).toHaveLength(1)
  })

  it('el productor se conforma con la instancia worker (el proceso worker llama getBoss() sin argumentos)', async () => {
    const getBoss = await load()
    const worker = await getBoss('worker')
    expect(await getBoss()).toBe(worker)
    expect(h.made).toHaveLength(1)
  })
})
