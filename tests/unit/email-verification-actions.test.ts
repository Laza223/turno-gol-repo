import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  billingGuard: vi.fn(),
  adminGuard: vi.fn(),
  getState: vi.fn(),
  replace: vi.fn(),
  send: vi.fn(),
  updateTenant: vi.fn(),
  updateUserById: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { refreshSession: vi.fn() } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById: m.updateUserById } } }),
}))
vi.mock('@/modules/staff/guards', () => ({
  requireBillingAdminStaffAction: m.billingGuard,
  requireAdminStaffAction: m.adminGuard,
}))
vi.mock('@/modules/auth/impersonation.server', () => ({
  getImpersonationSession: vi.fn(async () => null),
}))
vi.mock('@/modules/auth/auth.service', () => ({ isStaffEmailTaken: vi.fn(async () => false) }))
vi.mock('@/modules/auth/email-verification.service', () => ({
  getEmailVerificationState: m.getState,
  replaceUnverifiedEmail: m.replace,
  sendVerificationEmail: m.send,
}))
vi.mock('@/modules/tenants/tenant.service', () => ({ updateTenant: m.updateTenant }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn(async () => null) }))

import {
  changeUnverifiedEmailAction,
  resendVerificationEmailAction,
} from '@/app/(admin)/actions/email-verification'

const AUTH = {
  ok: true,
  user: { id: 'auth-1', staffUserId: 'staff-1' },
  tenant: { id: 't-1', email: 'viejo@test.local' },
}

beforeEach(() => {
  vi.clearAllMocks()
  m.billingGuard.mockResolvedValue(AUTH)
  m.getState.mockResolvedValue({ email: 'viejo@test.local', verified: false })
  m.replace.mockResolvedValue(true)
  m.send.mockResolvedValue({ ok: true })
  m.updateUserById.mockResolvedValue({ error: null })
  m.updateTenant.mockResolvedValue(undefined)
})

describe('mail sin verificar: el dueño moroso puede operar', () => {
  it('reenviar y cambiar usan el guard de facturación (suspended/blocked pasan), no el común', async () => {
    await resendVerificationEmailAction()
    await changeUnverifiedEmailAction('nuevo@test.local')
    expect(m.billingGuard).toHaveBeenCalledTimes(2)
    expect(m.adminGuard).not.toHaveBeenCalled()
  })
})

describe('changeUnverifiedEmailAction — consistencia', () => {
  it('si falla updateTenant, revierte staff_users y Auth', async () => {
    m.updateTenant.mockRejectedValue(new Error('db'))
    const res = await changeUnverifiedEmailAction('nuevo@test.local')
    expect(res.success).toBe(false)
    expect(m.replace).toHaveBeenNthCalledWith(1, 'staff-1', 'viejo@test.local', 'nuevo@test.local')
    expect(m.replace).toHaveBeenNthCalledWith(2, 'staff-1', 'nuevo@test.local', 'viejo@test.local')
    expect(m.updateUserById).toHaveBeenLastCalledWith(
      'auth-1',
      expect.objectContaining({ email: 'viejo@test.local' }),
    )
  })

  it('si falla replaceUnverifiedEmail, no toca el complejo ni intenta deshacer staff_users', async () => {
    m.replace.mockResolvedValue(false)
    const res = await changeUnverifiedEmailAction('nuevo@test.local')
    expect(res.success).toBe(false)
    expect(m.updateTenant).not.toHaveBeenCalled()
    expect(m.replace).toHaveBeenCalledTimes(1)
  })

  it('éxito limpio: sin aviso', async () => {
    expect(await changeUnverifiedEmailAction('nuevo@test.local')).toEqual({ success: true })
  })

  it.each(['rate_limited', 'send_failed'] as const)(
    'si el envío da %s, avisa que no se mandó el link',
    async (reason) => {
      m.send.mockResolvedValue({ ok: false, reason })
      const res = await changeUnverifiedEmailAction('nuevo@test.local')
      expect(res.success).toBe(true)
      if (res.success) expect(res.notice).toMatch(/Reenviar mail/)
    },
  )
})
