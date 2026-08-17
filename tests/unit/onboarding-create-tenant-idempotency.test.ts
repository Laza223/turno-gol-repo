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
// doc10 §2: el wizard deriva phone/email de la cuenta staff, no del form.
vi.mock('@/modules/staff/staff.service', () => ({
  getStaffContact: vi.fn(async () => ({ email: 'complejo@test.com', phone: '+54 11 2233-4455' })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { createTenantWithTrial, getStaffTenant } from '@/modules/tenants/tenant.service'
import { createTenantAction } from '@/app/onboarding/actions'

function validForm(): FormData {
  const fd = new FormData()
  fd.set('name', 'Complejo Test')
  fd.set('address', 'Calle Falsa 123')
  fd.set('city', 'Rosario')
  fd.set('province', 'Santa Fe')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createTenantAction — idempotencia (#35)', () => {
  it('no crea un tenant duplicado si el staff ya tiene uno', async () => {
    vi.mocked(getStaffTenant).mockResolvedValueOnce({ id: 'tenant-existing' } as never)
    const res = await createTenantAction({ success: true }, validForm())
    expect(res).toEqual({ success: true, next: '/onboarding/horarios', hardNavigate: true })
    expect(createTenantWithTrial).not.toHaveBeenCalled()
  })

  it('crea el tenant cuando el staff todavia no tiene ninguno', async () => {
    vi.mocked(getStaffTenant).mockResolvedValueOnce(null)
    const res = await createTenantAction({ success: true }, validForm())
    expect(res).toEqual({ success: true, next: '/onboarding/horarios', hardNavigate: true })
    expect(createTenantWithTrial).toHaveBeenCalledTimes(1)
  })
})
