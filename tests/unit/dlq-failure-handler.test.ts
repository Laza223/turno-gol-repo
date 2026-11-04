import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Sentry so captureException is an observable spy.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import { ALL_QUEUES, attachFailureHandlers } from '@/shared/jobs/dlq'
import { QUEUE_DEAD_LETTER, QUEUE_DEFINITIONS } from '@/shared/jobs/definitions'

type Handler = (jobs: unknown[]) => unknown

/** Fake pg-boss que registra el consumidor de la DLQ. */
function makeFakeBoss() {
  const handlers = new Map<string, { options: unknown; handler: Handler }>()
  const boss = {
    work: vi.fn(async (name: string, options: unknown, handler: Handler): Promise<string> => {
      handlers.set(name, { options, handler })
      return `worker-${name}`
    }),
  }
  return { boss, handlers }
}

describe('attachFailureHandlers', () => {
  let stderrSpy: ReturnType<typeof spyOnStderr>

  // logger.error writes a JSON line to stderr; intercept it (typed via helper so
  // the inferred signature matches the stderr.write overload under TS strict).
  function spyOnStderr() {
    return vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  beforeEach(() => {
    vi.clearAllMocks()
    stderrSpy = spyOnStderr()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('subscribes ONE consumer on the dead-letter queue, with metadata', async () => {
    const { boss, handlers } = makeFakeBoss()
    await attachFailureHandlers(boss as never)
    expect(boss.work).toHaveBeenCalledTimes(1)
    expect(handlers.get(QUEUE_DEAD_LETTER)?.options).toEqual({ includeMetadata: true })
  })

  it('reports a dead-lettered job to Sentry and logger.error', async () => {
    const { boss, handlers } = makeFakeBoss()
    await attachFailureHandlers(boss as never)

    await handlers.get(QUEUE_DEAD_LETTER)!.handler([
      {
        id: 'dlq-1',
        sourceName: 'whatsapp-turn',
        sourceId: 'j1',
        sourceOutput: { message: 'boom' },
      },
    ])

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const [errArg, ctxArg] = vi.mocked(Sentry.captureException).mock.calls[0]!
    expect(errArg).toBeInstanceOf(Error)
    expect((errArg as Error).message).toBe('Job whatsapp-turn failed: boom')
    expect((ctxArg as { tags: Record<string, string> }).tags.queue).toBe('whatsapp-turn')
    expect((ctxArg as { tags: Record<string, string> }).tags.job_id).toBe('j1')

    // logger.error emitted a structured line to stderr.
    expect(stderrSpy).toHaveBeenCalled()
    const line = String(stderrSpy.mock.calls.at(-1)?.[0] ?? '')
    const entry = JSON.parse(line.trim()) as Record<string, unknown>
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('job.failed')
    expect(entry.queue).toBe('whatsapp-turn')
    expect(entry.job_id).toBe('j1')
    expect(entry.error).toBe('boom')
  })

  it('accepts a string output and a missing one', async () => {
    const { boss, handlers } = makeFakeBoss()
    await attachFailureHandlers(boss as never)
    const { handler } = handlers.get(QUEUE_DEAD_LETTER)!

    await handler([{ id: 'd1', sourceName: 'q', sourceId: 'j3', sourceOutput: 'string error' }])
    await handler([{ id: 'd2', sourceName: 'q', sourceId: 'j4', sourceOutput: null }])

    const messages = vi
      .mocked(Sentry.captureException)
      .mock.calls.map((c) => (c[0] as Error).message)
    expect(messages).toEqual(['Job q failed: string error', 'Job q failed: unknown error'])
  })

  it('logs a warning instead of throwing when the subscription fails', async () => {
    const boss = {
      work: vi.fn(async () => {
        throw new Error('subscribe exploded')
      }),
    }
    await expect(attachFailureHandlers(boss as never)).resolves.toBeUndefined()
    expect(boss.work).toHaveBeenCalledTimes(1)
  })
})

describe('ALL_QUEUES', () => {
  it('es el registro sin la DLQ', () => {
    expect(ALL_QUEUES).toEqual(
      QUEUE_DEFINITIONS.map((q) => q.name).filter((n) => n !== QUEUE_DEAD_LETTER),
    )
    expect(ALL_QUEUES).toContain('daily-summary')
    expect(ALL_QUEUES).toContain('reconcile-subscriptions')
  })
})
