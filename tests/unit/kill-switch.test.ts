import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { redirectIfTenantSuspended, TENANT_SUSPENDED_FLAG } from '@/shared/kill-switch'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: vi.fn() }))

const mockRedirect = vi.mocked(redirect)
const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled)

afterEach(() => {
  vi.clearAllMocks()
})

describe('redirectIfTenantSuspended (kill switch)', () => {
  it('redirects to /suspended when the tenant carries the suspended flag', async () => {
    mockIsFeatureEnabled.mockResolvedValue(true)

    await redirectIfTenantSuspended('tenant-1')

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(TENANT_SUSPENDED_FLAG, 'tenant-1')
    expect(mockRedirect).toHaveBeenCalledWith('/suspended')
  })

  it('does not redirect when the tenant is not suspended', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false)

    await redirectIfTenantSuspended('tenant-1')

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(TENANT_SUSPENDED_FLAG, 'tenant-1')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
