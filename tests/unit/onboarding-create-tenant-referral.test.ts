import { beforeEach, describe, expect, it, vi } from 'vitest'

// B2: atribución del referidor en el alta (createTenantAction). Mismo esquema
// de mocks que onboarding-create-tenant-idempotency.test.ts, variando
// getStaffSignupReferral / resolveSignupReferrer.

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
vi.mock('@/modules/staff/staff.service', () => ({
  getStaffContact: vi.fn(async () => ({ email: 'complejo@test.com', phone: '+54 11 2233-4455' })),
  getStaffSignupReferral: vi.fn(async () => null),
}))
vi.mock('@/modules/referrals/referral.service', () => ({
  resolveSignupReferrer: vi.fn(async () => null),
}))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { createTenantWithTrial } from '@/modules/tenants/tenant.service'
import { getStaffSignupReferral } from '@/modules/staff/staff.service'
import { resolveSignupReferrer } from '@/modules/referrals/referral.service'
import { captureMessage } from '@/lib/sentry'
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

describe('createTenantAction — atribución de referidos (B2)', () => {
  it('con código válido, setea referred_by_tenant_id en el mismo insert', async () => {
    vi.mocked(getStaffSignupReferral).mockResolvedValueOnce({
      signupReferralCode: 'AH2K9MZP',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
    })
    vi.mocked(resolveSignupReferrer).mockResolvedValueOnce('tenant-referrer-1')

    const res = await createTenantAction({ success: true }, validForm())

    expect(res).toEqual({ success: true, next: '/onboarding/horarios', hardNavigate: true })
    expect(createTenantWithTrial).toHaveBeenCalledWith(
      expect.objectContaining({ referredByTenantId: 'tenant-referrer-1' }),
    )
  })

  it('un error al resolver el referidor no frena el alta, y queda sin referidor', async () => {
    vi.mocked(getStaffSignupReferral).mockRejectedValueOnce(new Error('DB caída'))

    const res = await createTenantAction({ success: true }, validForm())

    expect(res).toEqual({ success: true, next: '/onboarding/horarios', hardNavigate: true })
    expect(createTenantWithTrial).toHaveBeenCalledWith(
      expect.objectContaining({ referredByTenantId: null }),
    )
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(resolveSignupReferrer).not.toHaveBeenCalled()
  })

  it('sin código de referido, no cambia nada (referredByTenantId: null)', async () => {
    vi.mocked(getStaffSignupReferral).mockResolvedValueOnce(null)

    const res = await createTenantAction({ success: true }, validForm())

    expect(res).toEqual({ success: true, next: '/onboarding/horarios', hardNavigate: true })
    expect(createTenantWithTrial).toHaveBeenCalledWith(
      expect.objectContaining({ referredByTenantId: null }),
    )
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
