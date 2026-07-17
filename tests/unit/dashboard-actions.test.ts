import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix 3 (R5 🟢 residual — R2-1 CERRADO salvo este hallazgo): markPublicLinkSharedAction
// usaba extractAuthUser+getStaffTenant crudo, sin pasar por requireOperatorStaff
// (el guard central de M5) — un tenant bloqueado/suspendido podía tildar el
// checklist del dashboard por POST directo. Mismo patrón de mocks que
// staff-guards-tenant-lifecycle.test.ts / caja-actions-role-guard.test.ts.

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({ getImpersonationSession: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(async () => {}) }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'

const staffUser = { type: 'staff', staffUserId: 'staff-1' }

function tenant(status = 'active') {
  return { id: 'tenant-1', status }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(staffUser as never)
  vi.mocked(getStaffTenant).mockResolvedValue(tenant() as never)
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  vi.mocked(getImpersonationSession).mockResolvedValue(null)
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

  it('manager (Encargado) también puede tildar el checklist (requireOperatorStaff = admin+manager)', async () => {
    vi.mocked(getStaffRole).mockResolvedValueOnce('manager')
    vi.mocked(adminRateLimited).mockResolvedValueOnce(null)
    const { markPublicLinkSharedAction } = await import('@/app/(admin)/dashboard/actions')
    const res = await markPublicLinkSharedAction()
    expect(res.success).toBe(true)
  })

  it('tenant blocked: rebota con ok:false y NO muta (Fix 3, R5 🟢 residual)', async () => {
    vi.mocked(getStaffTenant).mockResolvedValueOnce(tenant('blocked') as never)
    const { markPublicLinkSharedAction } = await import('@/app/(admin)/dashboard/actions')

    const res = await markPublicLinkSharedAction()

    expect(res).toEqual({ success: false, error: 'El complejo está bloqueado por falta de pago.' })
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
    expect(vi.mocked(adminRateLimited)).not.toHaveBeenCalled()
  })

  it('tenant suspended: rebota con ok:false y NO muta', async () => {
    vi.mocked(getStaffTenant).mockResolvedValueOnce(tenant('suspended') as never)
    const { markPublicLinkSharedAction } = await import('@/app/(admin)/dashboard/actions')

    const res = await markPublicLinkSharedAction()

    expect(res).toEqual({ success: false, error: 'El complejo está bloqueado por falta de pago.' })
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('sin sesión staff: redirige a /login (no devuelve un result)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValueOnce(null)
    const { markPublicLinkSharedAction } = await import('@/app/(admin)/dashboard/actions')

    await expect(markPublicLinkSharedAction()).rejects.toThrow('REDIRECT:/login')
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
