import { afterEach, describe, expect, it, vi } from 'vitest'

// adminRateLimited() wraps enforce('adminCrud', tenantId) for Server Actions,
// which return a result object instead of an HTTP Response. We mock enforce so
// this test exercises only the helper's mapping (ok -> null, !ok -> message).
vi.mock('@/shared/rate-limit/apply', () => ({ enforce: vi.fn() }))

import { enforce } from '@/shared/rate-limit/apply'
import { adminRateLimited, ADMIN_RATE_LIMIT_MESSAGE } from '@/shared/rate-limit/server-action'

const mockEnforce = vi.mocked(enforce)

describe('adminRateLimited', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keys the adminCrud policy by tenant id and returns null when allowed', async () => {
    mockEnforce.mockResolvedValue({ ok: true, limit: 100, remaining: 99, reset: 0, unavailable: false })
    const result = await adminRateLimited('tenant-1')
    expect(result).toBeNull()
    expect(mockEnforce).toHaveBeenCalledWith('adminCrud', 'tenant-1')
  })

  it('returns the user-facing message when throttled', async () => {
    mockEnforce.mockResolvedValue({ ok: false, limit: 100, remaining: 0, reset: 0, unavailable: false })
    const result = await adminRateLimited('tenant-1')
    expect(result).toBe(ADMIN_RATE_LIMIT_MESSAGE)
  })

  it('throttles (fail-closed message) when the limiter is unavailable AND denies', async () => {
    // adminCrud is fail-open, but the helper must surface whatever enforce decides:
    // if ok=false it blocks regardless of why.
    mockEnforce.mockResolvedValue({ ok: false, limit: 100, remaining: 0, reset: 0, unavailable: true })
    expect(await adminRateLimited('tenant-1')).toBe(ADMIN_RATE_LIMIT_MESSAGE)
  })
})
