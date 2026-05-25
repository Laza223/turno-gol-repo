import { describe, expect, it, vi, beforeEach } from 'vitest'

const setTag = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  setTag: (key: string, value: unknown) => setTag(key, value),
}))

import { newRequestId, resolveRequestId } from '@/shared/lib/request-id'
import { tagSession } from '@/shared/middleware/observability'
import { runWithRequestContext, getRequestContext } from '@/shared/lib/request-context'

beforeEach(() => {
  setTag.mockClear()
})

describe('newRequestId', () => {
  it('returns a 12-char alphanumeric string', () => {
    const id = newRequestId()
    expect(id).toHaveLength(12)
    expect(id).toMatch(/^[A-Za-z0-9]{12}$/)
  })

  it('produces different ids on two calls', () => {
    expect(newRequestId()).not.toBe(newRequestId())
  })
})

describe('resolveRequestId', () => {
  it('returns a fresh 12-char id when incoming is null', () => {
    const id = resolveRequestId(null)
    expect(id).toHaveLength(12)
    expect(id).toMatch(/^[A-Za-z0-9]{12}$/)
  })

  it('returns the incoming id when present and short enough', () => {
    expect(resolveRequestId('abc')).toBe('abc')
  })

  it('returns a fresh id when incoming exceeds 64 chars', () => {
    const tooLong = 'x'.repeat(65)
    const id = resolveRequestId(tooLong)
    expect(id).not.toBe(tooLong)
    expect(id).toHaveLength(12)
  })
})

describe('tagSession', () => {
  it('updates the active context and sets Sentry tags', () => {
    runWithRequestContext({ requestId: 'req-1' }, () => {
      tagSession('tenant-1', 'user-1', 'staff')

      const ctx = getRequestContext()
      expect(ctx?.tenantId).toBe('tenant-1')
      expect(ctx?.userId).toBe('user-1')
      expect(ctx?.userType).toBe('staff')

      expect(setTag).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(setTag).toHaveBeenCalledWith('user_id', 'user-1')
      expect(setTag).toHaveBeenCalledWith('user_type', 'staff')
    })
  })

  it('only sets the tags it is given', () => {
    runWithRequestContext({ requestId: 'req-2' }, () => {
      tagSession(null, 'player-9', 'player')

      const ctx = getRequestContext()
      expect(ctx?.tenantId).toBeUndefined()
      expect(ctx?.userId).toBe('player-9')
      expect(ctx?.userType).toBe('player')

      expect(setTag).not.toHaveBeenCalledWith('tenant_id', expect.anything())
      expect(setTag).toHaveBeenCalledWith('user_id', 'player-9')
      expect(setTag).toHaveBeenCalledWith('user_type', 'player')
    })
  })

  it('does not throw when called outside any context', () => {
    expect(() => tagSession('tenant-x', 'user-x', 'staff')).not.toThrow()
    expect(getRequestContext()).toBeUndefined()
  })
})
