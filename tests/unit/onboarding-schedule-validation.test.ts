import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

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
  createTenantWithTrial: vi.fn(),
  getStaffTenant: vi.fn(async () => ({ id: 'tenant-1' })),
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

import { updateTenant } from '@/modules/tenants/tenant.service'
import { updateScheduleAction } from '@/app/onboarding/actions'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function week(
  overrides: Partial<Record<(typeof DAYS)[number], { open: string; close: string; closed?: boolean }>> = {},
): OpeningHours {
  const out = {} as Record<string, { open: string; close: string; closed?: boolean }>
  for (const d of DAYS) out[d] = overrides[d] ?? { open: '08:00', close: '23:00' }
  return out as OpeningHours
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateScheduleAction — validacion de openingHours (#36)', () => {
  it('rechaza un dia abierto con cierre <= apertura', async () => {
    const res = await updateScheduleAction(week({ mon: { open: '22:00', close: '08:00' } }))
    expect(res).toEqual({
      success: false,
      error: 'El horario de cierre debe ser posterior al de apertura.',
    })
    expect(updateTenant).not.toHaveBeenCalled()
  })

  it('rechaza un formato de hora invalido', async () => {
    const res = await updateScheduleAction(week({ tue: { open: '8am', close: '23:00' } }))
    expect(res.success).toBe(false)
    expect(updateTenant).not.toHaveBeenCalled()
  })

  it('acepta una semana valida', async () => {
    const res = await updateScheduleAction(week())
    expect(res).toEqual({ success: true })
    expect(updateTenant).toHaveBeenCalledTimes(1)
  })

  it('no exige cierre > apertura en un dia marcado como cerrado', async () => {
    const res = await updateScheduleAction(
      week({ sun: { open: '10:00', close: '08:00', closed: true } }),
    )
    expect(res).toEqual({ success: true })
    expect(updateTenant).toHaveBeenCalledTimes(1)
  })
})
