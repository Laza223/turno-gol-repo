import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(async () => {}) }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'

const staffUser = { type: 'staff', staffUserId: 'staff-1' }
const tenant = { id: 'tenant-1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(staffUser as never)
  vi.mocked(getStaffTenant).mockResolvedValue(tenant as never)
})

describe('markPublicLinkSharedAction', () => {
  it('returns success:false surfacing the rate-limit message when limited', async () => {
    vi.mocked(adminRateLimited).mockResolvedValueOnce('Demasiados intentos. Esperá un momento.')
    const { markPublicLinkSharedAction } = await import('@/app/(admin)/dashboard/actions')
    const res = await markPublicLinkSharedAction()
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Demasiados intentos. Esperá un momento.')
  })

  it('returns success:true on the happy path (not rate limited)', async () => {
    vi.mocked(adminRateLimited).mockResolvedValueOnce(null)
    const { markPublicLinkSharedAction } = await import('@/app/(admin)/dashboard/actions')
    const res = await markPublicLinkSharedAction()
    expect(res.success).toBe(true)
  })
})

describe('markTourSeenAction', () => {
  it('returns success:false surfacing the rate-limit message when limited', async () => {
    vi.mocked(adminRateLimited).mockResolvedValueOnce('Demasiados intentos. Esperá un momento.')
    const { markTourSeenAction } = await import('@/app/(admin)/dashboard/actions')
    const res = await markTourSeenAction()
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Demasiados intentos. Esperá un momento.')
  })

  it('returns success:true on the happy path (not rate limited)', async () => {
    vi.mocked(adminRateLimited).mockResolvedValueOnce(null)
    const { markTourSeenAction } = await import('@/app/(admin)/dashboard/actions')
    const res = await markTourSeenAction()
    expect(res.success).toBe(true)
  })
})

describe('markChecklistDismissedAction', () => {
  it('returns success:false surfacing the rate-limit message when limited', async () => {
    vi.mocked(adminRateLimited).mockResolvedValueOnce('Demasiados intentos. Esperá un momento.')
    const { markChecklistDismissedAction } = await import('@/app/(admin)/dashboard/actions')
    const res = await markChecklistDismissedAction()
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Demasiados intentos. Esperá un momento.')
  })

  it('returns success:true on the happy path (not rate limited)', async () => {
    vi.mocked(adminRateLimited).mockResolvedValueOnce(null)
    const { markChecklistDismissedAction } = await import('@/app/(admin)/dashboard/actions')
    const res = await markChecklistDismissedAction()
    expect(res.success).toBe(true)
  })
})
