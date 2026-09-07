import { beforeEach, describe, expect, it, vi } from 'vitest'

// `finishOnboardingAction` es el instante exacto en que un complejo pasa a ser
// visible en el buscador público: marca `onboarding_completed` en
// `tenants.settings`, y `searchPublicTenantsImpl` exige justamente esa clave
// para listarlo. Sin invalidar los tags públicos, `/explorar` y la home seguían
// mostrando el listado viejo hasta 300 s después de que el wizard ya le había
// dicho al dueño que había terminado.
//
// Los mocks replican los de `onboarding-role-guard.test.ts`: la acción tiene que
// llegar HASTA EL FINAL para que la aserción sobre los tags sea real y no un
// falso verde por un mock a medio configurar.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(),
  createTenantWithTrial: vi.fn(),
  completeOnboarding: vi.fn(),
  updateTenant: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({
  getStaffRole: vi.fn(),
  getStaffContact: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn(async () => null) }))
vi.mock('@/modules/auth/auth.service', () => ({ setStaffTenantClaim: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { refreshSession: vi.fn() } }),
}))
vi.mock('@/modules/courts/court.service', () => ({
  createCourt: vi.fn(async () => ({ id: 'court-1' })),
  getCourtCountAndLimit: vi.fn(async () => ({ count: 1, maxCourts: null, planSlug: null })),
  listCourts: vi.fn(async () => []),
  validatePricingRulesCoverage: vi.fn(() => ({ valid: true, gaps: [] })),
}))
// `hasAnyBooking` toca `tx.select(...)` directo: sin este mock la acción explota
// contra el `{}` que `withTenantContext` devuelve como tx falso.
vi.mock('@/modules/onboarding/onboarding.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/onboarding/onboarding.service')>()
  return { ...actual, hasAnyBooking: vi.fn(async () => true) }
})

import { updateTag } from 'next/cache'
import { finishOnboardingAction } from '@/app/onboarding/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { completeOnboarding, getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { PUBLIC_CITIES_TAG, PUBLIC_TENANTS_TAG } from '@/shared/cache/public-listings'

const STAFF_USER = { type: 'staff', id: 'auth-1', staffUserId: 'staff-1', email: 'staff@test.com' }
const TENANT = { id: 'tenant-1', slug: 'demo' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
})

describe('finishOnboardingAction — el complejo aparece en el buscador sin esperar el TTL', () => {
  it('invalida los tags del listado público al cerrar el onboarding', async () => {
    await expect(finishOnboardingAction()).rejects.toThrow('REDIRECT:/onboarding/listo')

    expect(vi.mocked(completeOnboarding)).toHaveBeenCalledWith('tenant-1')
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith(PUBLIC_TENANTS_TAG)
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith(PUBLIC_CITIES_TAG)
  })

  it('no invalida nada si el rol no puede cerrar el onboarding', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')

    await expect(finishOnboardingAction()).rejects.toThrow('REDIRECT:/dashboard')

    expect(vi.mocked(completeOnboarding)).not.toHaveBeenCalled()
    expect(vi.mocked(updateTag)).not.toHaveBeenCalled()
  })
})
