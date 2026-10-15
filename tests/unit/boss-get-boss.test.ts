import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

/**
 * `getBoss()`: arranque single-flight y rol (productor en la web, worker en
 * Railway). `pg-boss` va mockeado: se mide CUÁNTAS instancias se crean, con qué
 * opciones y qué pasa cuando `start()` falla o se cuelga.
 */
type Fake = {
  config: { noSupervisor?: boolean; noScheduling?: boolean; connectionTimeoutMillis?: number }
  start: Mock
  stop: Mock
}
const h = vi.hoisted(() => ({
  made: [] as Fake[],
  start: async (): Promise<void> => {},
}))

vi.mock('pg-boss', () => ({
  default: class FakeBoss {
    config: Fake['config']
    start = vi.fn(() => h.start())
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
    // `stop()` a secas NO cierra el pool de pg-boss 9.0.3: hace falta `destroy`.
    expect(h.made[0].stop).toHaveBeenCalledWith({ graceful: false, destroy: true })

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
    expect(h.made[0].stop).toHaveBeenCalledWith({ graceful: false, destroy: true })

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

  it.each([
    ['producer', true, 10_000],
    ['worker', false, undefined],
  ] as const)(
    'rol %s: noSupervisor y noScheduling = %s, connectionTimeoutMillis = %s',
    async (role, flag, connectTimeout) => {
      const getBoss = await load()
      await getBoss(role)
      expect(Boolean(h.made[0].config.noSupervisor)).toBe(flag)
      expect(Boolean(h.made[0].config.noScheduling)).toBe(flag)
      expect(h.made[0].config.connectionTimeoutMillis).toBe(connectTimeout)
    },
  )

  it('sin argumentos es productor', async () => {
    const getBoss = await load()
    await getBoss()
    expect(h.made[0].config).toMatchObject({ noSupervisor: true, noScheduling: true })
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
