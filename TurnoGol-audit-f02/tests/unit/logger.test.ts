import { describe, expect, it, vi, afterEach } from 'vitest'
import { runWithRequestContext } from '@/shared/lib/request-context'
import { logger } from '@/shared/lib/logger'

afterEach(() => {
  vi.restoreAllMocks()
})

function captureStdout(): { calls: string[] } {
  const calls: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    calls.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  })
  return { calls }
}

function captureStderr(): { calls: string[] } {
  const calls: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    calls.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  })
  return { calls }
}

describe('logger output format', () => {
  it('writes a single-line JSON string ending with newline', () => {
    const { calls } = captureStdout()
    logger.info('hello world')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/\n$/)
    expect(() => JSON.parse(calls[0])).not.toThrow()
  })

  it('parsed entry has timestamp, level, and message', () => {
    const { calls } = captureStdout()
    logger.info('structured test')
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(entry).toHaveProperty('timestamp')
    expect(entry).toHaveProperty('level', 'info')
    expect(entry).toHaveProperty('message', 'structured test')
  })

  it('timestamp is a valid ISO 8601 string', () => {
    const { calls } = captureStdout()
    logger.info('ts check')
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(typeof entry.timestamp).toBe('string')
    expect(new Date(entry.timestamp as string).toISOString()).toBe(entry.timestamp)
  })
})

describe('logger levels and output streams', () => {
  it('debug writes to stdout', () => {
    const { calls } = captureStdout()
    logger.debug('debug msg')
    expect(calls).toHaveLength(1)
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(entry.level).toBe('debug')
  })

  it('info writes to stdout', () => {
    const { calls } = captureStdout()
    logger.info('info msg')
    expect(calls).toHaveLength(1)
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(entry.level).toBe('info')
  })

  it('warn writes to stdout', () => {
    const { calls } = captureStdout()
    logger.warn('warn msg')
    expect(calls).toHaveLength(1)
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(entry.level).toBe('warn')
  })

  it('error writes to stderr (not stdout)', () => {
    const stdoutCalls: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutCalls.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    })
    const { calls: stderrCalls } = captureStderr()

    logger.error('error msg')

    expect(stdoutCalls).toHaveLength(0)
    expect(stderrCalls).toHaveLength(1)
    const entry = JSON.parse(stderrCalls[0]) as Record<string, unknown>
    expect(entry.level).toBe('error')
  })
})

describe('logger context injection', () => {
  it('injects request_id, tenant_id, user_id, user_type when inside a request context', () => {
    const { calls } = captureStdout()

    runWithRequestContext(
      { requestId: 'req-abc', tenantId: 'tenant-xyz', userId: 'user-99', userType: 'staff' },
      () => {
        logger.info('with context')
      },
    )

    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(entry.request_id).toBe('req-abc')
    expect(entry.tenant_id).toBe('tenant-xyz')
    expect(entry.user_id).toBe('user-99')
    expect(entry.user_type).toBe('staff')
  })

  it('omits contextual fields (not undefined/null) when outside a request context', () => {
    const { calls } = captureStdout()
    logger.info('no context')
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect('request_id' in entry).toBe(false)
    expect('tenant_id' in entry).toBe(false)
    expect('user_id' in entry).toBe(false)
    expect('user_type' in entry).toBe(false)
  })

  it('omits optional context fields that are not set', () => {
    const { calls } = captureStdout()

    runWithRequestContext({ requestId: 'req-min' }, () => {
      logger.info('minimal context')
    })

    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(entry.request_id).toBe('req-min')
    expect('tenant_id' in entry).toBe(false)
    expect('user_id' in entry).toBe(false)
    expect('user_type' in entry).toBe(false)
  })
})

describe('logger meta merging', () => {
  it('merges meta keys into the log entry', () => {
    const { calls } = captureStdout()
    logger.info('with meta', { bookingId: 'bk-1', courtId: 'court-5' })
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    expect(entry.bookingId).toBe('bk-1')
    expect(entry.courtId).toBe('court-5')
  })

  it('meta is spread last so it can override reserved keys (last-write-wins)', () => {
    // This documents the intentional behavior: meta can override level, message, etc.
    const { calls } = captureStdout()
    logger.info('override test', { level: 'custom-override' })
    const entry = JSON.parse(calls[0]) as Record<string, unknown>
    // meta spreads after the base fields, so level is overridden
    expect(entry.level).toBe('custom-override')
  })
})
