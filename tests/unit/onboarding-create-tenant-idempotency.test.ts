import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({
    type: 'staff',
    id: 'auth-1',
    staffUserId: 'staff-1',
    email: 'admin@test.com',
  })),
}))
vi.mock('@/modules/auth/auth.service', () => ({ setStaffTenantClaim: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { refreshSession: vi.fn() } }),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({
  adminRateLimited: vi.fn(async () => null),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  createTenantWithTrial: vi.fn(async () => ({ id: 'tenant-new' })),
  getStaffTenant: vi.fn(async () => null),
  updateOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(),
  updateTenant: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import {
  createTenantWithTrial,
  getStaffTenant,
} from '@/modules/tenants/tenant.service'
import { createTenantAction } from '@/app/onboarding/actions'

function validForm(): FormData {
  const fd = new FormData()
  fd.set('name', 'Complejo Test')
  fd.set('address', 'Calle Falsa 123')
  fd.set('city', 'Rosario')
  fd.set('province', 'Santa Fe')
  fd.set('phone', '1122334455')
  fd.set('email', 'complejo@test.com')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createTenantAction — idempotencia (#35)', () => {
  it('no crea un tenant duplicado si el staff ya tiene uno', async () => {
    vi.mocked(getStaffTenant).mockResolvedValueOnce({ id: 'tenant-existing' } as never)
    const res = await createTenantAction(validForm())
    expect(res).toEqual({ success: true })
    expect(createTenantWithTrial).not.toHaveBeenCalled()
  })

  it('crea el tenant cuando el staff todavia no tiene ninguno', async () => {
    vi.mocked(getStaffTenant).mockResolvedValueOnce(null)
    const res = await createTenantAction(validForm())
    expect(res).toEqual({ success: true })
    expect(createTenantWithTrial).toHaveBeenCalledTimes(1)
  })
})
