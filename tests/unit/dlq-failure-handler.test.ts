import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Sentry so captureException is an observable spy.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import { ALL_QUEUES, attachFailureHandlers } from '@/shared/jobs/dlq'

type Handler = (job: unknown) => unknown

/** Fake pg-boss that records every onComplete subscription. */
function makeFakeBoss() {
  const handlers = new Map<string, Handler>()
  const boss = {
    onComplete: vi.fn(async (name: string, handler: Handler): Promise<string> => {
      handlers.set(name, handler)
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
    return vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    stderrSpy = spyOnStderr()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('subscribes one onComplete handler per queue', async () => {
    const { boss, handlers } = makeFakeBoss()
    await attachFailureHandlers(boss as never)
    expect(boss.onComplete).toHaveBeenCalledTimes(ALL_QUEUES.length)
    for (const queue of ALL_QUEUES) {
      expect(handlers.has(queue)).toBe(true)
    }
  })

  it('reports a failed completion to Sentry and logger.error', async () => {
    const { boss, handlers } = makeFakeBoss()
    await attachFailureHandlers(boss as never)

    const queue = ALL_QUEUES[0]!
    const handler = handlers.get(queue)!
    handler({ id: 'j1', data: { state: 'failed', response: { message: 'boom' } } })

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const [errArg, ctxArg] = vi.mocked(Sentry.captureException).mock.calls[0]!
    expect(errArg).toBeInstanceOf(Error)
    expect((errArg as Error).message).toContain('boom')
    expect((ctxArg as { tags: Record<string, string> }).tags.queue).toBe(queue)
    expect((ctxArg as { tags: Record<string, string> }).tags.job_id).toBe('j1')

    // logger.error emitted a structured line to stderr.
    expect(stderrSpy).toHaveBeenCalled()
    const line = String(stderrSpy.mock.calls.at(-1)?.[0] ?? '')
    const entry = JSON.parse(line.trim()) as Record<string, unknown>
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('job.failed')
    expect(entry.queue).toBe(queue)
    expect(entry.job_id).toBe('j1')
    expect(entry.error).toBe('boom')
  })

  it('detects failure via the `failed` flag even when state is absent', async () => {
    const { boss, handlers } = makeFakeBoss()
    await attachFailureHandlers(boss as never)

    const handler = handlers.get(ALL_QUEUES[0]!)!
    handler({ id: 'j3', data: { failed: true, response: 'string error' } })

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const [errArg] = vi.mocked(Sentry.captureException).mock.calls[0]!
    expect((errArg as Error).message).toContain('string error')
  })

  it('ignores a successful completion', async () => {
    const { boss, handlers } = makeFakeBoss()
    await attachFailureHandlers(boss as never)

    const handler = handlers.get(ALL_QUEUES[0]!)!
    handler({ id: 'j2', data: { state: 'completed', failed: false } })

    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('logs a warning instead of throwing when a subscription fails', async () => {
    const boss = {
      onComplete: vi.fn(async () => {
        throw new Error('subscribe exploded')
      }),
    }
    await expect(attachFailureHandlers(boss as never)).resolves.toBeUndefined()
    // One warn line per queue; warns go to stdout, but we only assert no throw.
    expect(boss.onComplete).toHaveBeenCalledTimes(ALL_QUEUES.length)
  })
})
