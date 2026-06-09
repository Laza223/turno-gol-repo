import { describe, expect, it } from 'vitest'
import {
  runWithRequestContext,
  getRequestContext,
  updateRequestContext,
} from '@/shared/lib/request-context'

describe('getRequestContext', () => {
  it('returns undefined outside any run', () => {
    expect(getRequestContext()).toBeUndefined()
  })
})

describe('runWithRequestContext', () => {
  it('propagates context across an await boundary', async () => {
    const ctx = { requestId: 'req-1', tenantId: 'tenant-1' }
    let captured: ReturnType<typeof getRequestContext>

    await runWithRequestContext(ctx, async () => {
      await Promise.resolve()
      captured = getRequestContext()
    })

    expect(captured).toEqual(ctx)
  })

  it('isolates concurrent contexts from each other', async () => {
    const results: Array<ReturnType<typeof getRequestContext>> = []

    await Promise.all([
      runWithRequestContext({ requestId: 'req-a', tenantId: 'tenant-a' }, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
        results[0] = getRequestContext()
      }),
      runWithRequestContext({ requestId: 'req-b', tenantId: 'tenant-b' }, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 5))
        results[1] = getRequestContext()
      }),
    ])

    expect(results[0]?.requestId).toBe('req-a')
    expect(results[0]?.tenantId).toBe('tenant-a')
    expect(results[1]?.requestId).toBe('req-b')
    expect(results[1]?.tenantId).toBe('tenant-b')
  })
})

describe('updateRequestContext', () => {
  it('mutates the active context', () => {
    runWithRequestContext({ requestId: 'req-2' }, () => {
      updateRequestContext({ userId: 'user-1', userType: 'staff' })
      const ctx = getRequestContext()
      expect(ctx?.userId).toBe('user-1')
      expect(ctx?.userType).toBe('staff')
      expect(ctx?.requestId).toBe('req-2')
    })
  })

  it('is a no-op when there is no active context', () => {
    // Should not throw
    expect(() => updateRequestContext({ userId: 'ghost' })).not.toThrow()
    expect(getRequestContext()).toBeUndefined()
  })
})
