import { beforeEach, describe, expect, it, vi } from 'vitest'

const logged = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/shared/lib/logger', () => ({ logger: logged }))

import { ensureQueues } from '@/shared/jobs/ensure-queues'
import {
  QUEUE_DEAD_LETTER,
  QUEUE_DEFINITIONS,
  QUEUE_WHATSAPP_TURN,
} from '@/shared/jobs/definitions'

type Existing = { name: string; policy: string }

function makeBoss(existing: Existing[]) {
  const calls: string[] = []
  const boss = {
    getQueues: vi.fn(async () => existing),
    createQueue: vi.fn(async (name: string) => {
      calls.push(`create:${name}`)
    }),
    updateQueue: vi.fn(async (name: string) => {
      calls.push(`update:${name}`)
    }),
  }
  return { boss, calls }
}

const names = QUEUE_DEFINITIONS.map((q) => q.name)

beforeEach(() => vi.clearAllMocks())

describe('ensureQueues', () => {
  it('base vacía: crea todas, la DLQ primero, con UN solo getQueues', async () => {
    const { boss, calls } = makeBoss([])
    await ensureQueues(boss as never, 'producer')
    expect(boss.getQueues).toHaveBeenCalledTimes(1)
    expect(calls[0]).toBe(`create:${QUEUE_DEAD_LETTER}`)
    expect(calls.sort()).toEqual(names.map((n) => `create:${n}`).sort())
    expect(boss.updateQueue).not.toHaveBeenCalled()
  })

  it('productor: solo crea las que faltan y nunca hace updateQueue', async () => {
    const existing = names
      .filter((n) => n !== 'rival-mail')
      .map((name) => ({ name, policy: 'standard' }))
    const { boss, calls } = makeBoss(
      existing.map((q) => ({
        ...q,
        policy: q.name === QUEUE_WHATSAPP_TURN ? 'stately' : 'standard',
      })),
    )
    await ensureQueues(boss as never, 'producer')
    expect(calls).toEqual(['create:rival-mail'])
    expect(boss.updateQueue).not.toHaveBeenCalled()
  })

  it('worker: además actualiza las existentes con las opciones del registro, sin policy', async () => {
    const existing = names.map((name) => ({
      name,
      policy: name === QUEUE_WHATSAPP_TURN ? 'stately' : 'standard',
    }))
    const { boss } = makeBoss(existing)
    await ensureQueues(boss as never, 'worker')
    expect(boss.createQueue).not.toHaveBeenCalled()
    expect(boss.updateQueue).toHaveBeenCalledTimes(names.length)
    const turn = boss.updateQueue.mock.calls.find((c) => c[0] === QUEUE_WHATSAPP_TURN) as unknown[]
    expect(turn[1]).toEqual({ retryLimit: 0, expireInSeconds: 900, deadLetter: QUEUE_DEAD_LETTER })
    expect(logged.error).not.toHaveBeenCalled()
  })

  it('worker: si la política existente difiere, loguea error y sigue (no se puede cambiar)', async () => {
    const existing = names.map((name) => ({ name, policy: 'standard' })) // whatsapp-turn debería ser stately
    const { boss } = makeBoss(existing)
    await ensureQueues(boss as never, 'worker')
    expect(logged.error).toHaveBeenCalledTimes(1)
    expect(logged.error.mock.calls[0]?.[1]).toMatchObject({
      queue: QUEUE_WHATSAPP_TURN,
      existing: 'standard',
      wanted: 'stately',
    })
    // Siguió: actualizó todas igual.
    expect(boss.updateQueue).toHaveBeenCalledTimes(names.length)
  })
})
