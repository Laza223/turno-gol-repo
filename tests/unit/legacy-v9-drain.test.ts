import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  log: [] as string[],
  selectRows: [] as unknown[],
  // Si tiene algo, cada SELECT consume el primero (para simular lotes sucesivos).
  selectQueue: [] as unknown[][],
  selectError: null as unknown,
  // Si está, el SELECT espera a que se resuelva (una pasada que sigue en curso).
  selectGate: null as Promise<void> | null,
  unsafe: vi.fn(),
  selectText: '',
}))

vi.mock('@/shared/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/shared/db/client', () => {
  // `tx` es una tagged template (SELECT / DELETE) con `unsafe` colgado, como postgres-js.
  const tx = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?')
      if (text.includes('SELECT')) {
        h.selectText = text
        h.log.push('select')
        if (h.selectGate) await h.selectGate
        if (h.selectError) throw h.selectError
        return h.selectQueue.shift() ?? h.selectRows
      }
      h.log.push('delete')
      h.log.push(`delete-ids:${JSON.stringify(values[0])}`)
      return []
    },
    { unsafe: h.unsafe },
  )
  return { getSql: () => ({ begin: async (fn: (t: unknown) => unknown) => fn(tx) }) }
})

import { logger } from '@/shared/lib/logger'
import {
  drainLegacyV9Once,
  LEGACY_DRAIN_QUEUES,
  startLegacyV9Drain,
} from '@/shared/jobs/legacy-v9-drain'

function row(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'push-send',
    data_json: '{"subscription_id":"s1"}',
    priority: 2,
    retrylimit: 3,
    retrycount: 1,
    retrydelay: 30,
    retrybackoff: true,
    start_after_ms: '1790000000000',
    singletonkey: null,
    expire_seconds: 3600,
    ...over,
  }
}

function makeBoss() {
  return {
    insert: vi.fn(async (name: string, _jobs: unknown[], options?: { db?: unknown }) => {
      h.log.push(`insert:${name}`)
      return options ? [] : null
    }),
  }
}

beforeEach(() => {
  h.log.length = 0
  h.selectRows = []
  h.selectQueue = []
  h.selectError = null
  h.selectGate = null
  h.unsafe.mockReset()
  vi.mocked(logger.warn).mockClear()
})

const selects = () => h.log.filter((l) => l === 'select').length

describe('drainLegacyV9Once', () => {
  it('sin pendientes: 0 y no inserta', async () => {
    const boss = makeBoss()
    expect(await drainLegacyV9Once(boss as never)).toBe(0)
    expect(boss.insert).not.toHaveBeenCalled()
    expect(h.log).toEqual(['select'])
  })

  it('selecciona solo las colas con datos, sin crons ni whatsapp-turn, y excluye los ticks de send-email', async () => {
    await drainLegacyV9Once(makeBoss() as never)
    expect([...LEGACY_DRAIN_QUEUES].sort()).toEqual(
      [
        'expire-pending-booking',
        'process-mp-webhook',
        'push-send',
        'rival-mail',
        'send-email',
      ].sort(),
    )
    expect(LEGACY_DRAIN_QUEUES).not.toContain('whatsapp-turn')
    expect(h.selectText).toContain('FOR UPDATE SKIP LOCKED')
    expect(h.selectText).toContain("state IN ('created', 'retry')")
    expect(h.selectText).toContain("data = '{}'::jsonb")
    expect(h.selectText).toContain('data::text')
  })

  it('mapea las columnas de la 9 a las opciones de insert de la 12', async () => {
    h.selectRows = [row({ singletonkey: 'k1' })]
    const boss = makeBoss()
    expect(await drainLegacyV9Once(boss as never)).toBe(1)

    const [name, jobs, options] = boss.insert.mock.calls[0] as [
      string,
      Record<string, unknown>[],
      { db: unknown },
    ]
    expect(name).toBe('push-send')
    expect(jobs).toEqual([
      {
        id: '11111111-1111-1111-1111-111111111111',
        data: { subscription_id: 's1' },
        priority: 2,
        retryLimit: 2, // retrylimit - retrycount
        retryDelay: 30,
        retryBackoff: true,
        startAfter: new Date(1790000000000),
        singletonKey: 'k1',
        expireInSeconds: 3600,
      },
    ])
    expect(options.db).toHaveProperty('executeSql')
  })

  it('retryLimit nunca negativo, expireInSeconds acotado a [1, 86400], data nula y sin singletonKey', async () => {
    h.selectRows = [
      row({ id: 'a', retrylimit: 0, retrycount: 4, expire_seconds: 0, data_json: null }),
      row({ id: 'b', expire_seconds: 7 * 86400 }),
    ]
    const boss = makeBoss()
    await drainLegacyV9Once(boss as never)
    const jobs = (boss.insert.mock.calls[0] as unknown as [string, Record<string, unknown>[]])[1]
    expect(jobs[0]).toMatchObject({
      retryLimit: 0,
      expireInSeconds: 1,
      data: undefined,
      singletonKey: undefined,
    })
    expect(jobs[1]).toMatchObject({ expireInSeconds: 86400 })
  })

  it('un insert por cola, y el DELETE va DESPUÉS de todos los inserts en la misma transacción', async () => {
    h.selectRows = [row({ id: 'a' }), row({ id: 'b', name: 'send-email' }), row({ id: 'c' })]
    const boss = makeBoss()
    expect(await drainLegacyV9Once(boss as never)).toBe(3)
    expect(h.log).toEqual([
      'select',
      'insert:push-send',
      'insert:send-email',
      'delete',
      'delete-ids:["a","b","c"]',
    ])
  })

  it('executeSql corre por la transacción (tx.unsafe) con los valores', async () => {
    h.selectRows = [row()]
    h.unsafe.mockResolvedValue([{ id: 'x' }])
    const boss = makeBoss()
    await drainLegacyV9Once(boss as never)
    const { db } = (
      boss.insert.mock.calls[0] as unknown as [
        string,
        unknown[],
        { db: { executeSql: (t: string, v?: unknown[]) => Promise<{ rows: unknown[] }> } },
      ]
    )[2]
    expect(await db.executeSql('INSERT 1', [1, 2])).toEqual({ rows: [{ id: 'x' }] })
    expect(h.unsafe).toHaveBeenCalledWith('INSERT 1', [1, 2])
  })

  it('si un insert falla, no borra nada y propaga', async () => {
    h.selectRows = [row()]
    const boss = makeBoss()
    boss.insert.mockRejectedValueOnce(new Error('boom'))
    await expect(drainLegacyV9Once(boss as never)).rejects.toThrow('boom')
    expect(h.log).not.toContain('delete')
  })

  it.each(['42P01', '3F000'])(
    'error %s (tabla o schema inexistente) => 0 sin ruido',
    async (code) => {
      h.selectError = Object.assign(new Error('relation does not exist'), { code })
      expect(await drainLegacyV9Once(makeBoss() as never)).toBe(0)
    },
  )

  it('cualquier otro error de la base se propaga', async () => {
    h.selectError = Object.assign(new Error('permission denied'), { code: '42501' })
    await expect(drainLegacyV9Once(makeBoss() as never)).rejects.toThrow('permission denied')
  })
})

describe('startLegacyV9Drain', () => {
  let stop: (() => void) | null = null

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    stop?.()
    stop = null
    vi.useRealTimers()
  })

  it('una pasada al arrancar, otra cada 60 s, y se apaga sola tras la pasada 60', async () => {
    stop = startLegacyV9Drain(makeBoss() as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(selects()).toBe(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(selects()).toBe(2)

    await vi.advanceTimersByTimeAsync(58 * 60_000)
    expect(selects()).toBe(60)
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(selects()).toBe(60)
  })

  it('stop() corta el intervalo', async () => {
    stop = startLegacyV9Drain(makeBoss() as never)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(selects()).toBe(1)
  })

  it('si la pasada anterior sigue en curso, el tick no arranca otra', async () => {
    let release!: () => void
    h.selectGate = new Promise<void>((r) => {
      release = r
    })
    stop = startLegacyV9Drain(makeBoss() as never)
    await vi.advanceTimersByTimeAsync(3 * 60_000)
    expect(selects()).toBe(1)

    h.selectGate = null
    release()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(selects()).toBe(2)
  })

  it('con un lote lleno (500) repite en la misma pasada hasta que vuelve uno parcial', async () => {
    const batch = (n: number) => Array.from({ length: n }, (_, i) => row({ id: `id-${n}-${i}` }))
    h.selectQueue = [batch(500), batch(499)]
    stop = startLegacyV9Drain(makeBoss() as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(selects()).toBe(2)
  })

  it('una pasada que falla se loguea y la siguiente reintenta', async () => {
    h.selectError = Object.assign(new Error('permission denied'), { code: '42501' })
    stop = startLegacyV9Drain(makeBoss() as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(logger.warn).toHaveBeenCalledTimes(1)

    h.selectError = null
    await vi.advanceTimersByTimeAsync(60_000)
    expect(selects()).toBe(2)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})
