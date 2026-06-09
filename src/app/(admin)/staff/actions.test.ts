import { beforeEach, describe, expect, it, vi } from 'vitest'

// Guards de mutacion de staff (Fase 3 #12/#13/#14). Mockeamos toda la
// infraestructura (auth, tenant, PIN, rate-limit, DB, Supabase admin) para
// testear la logica de autorizacion sin DB.
vi.mock('@/app/(admin)/actions/pin', () => ({
  checkPinSessionAction: vi.fn(),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({
  adminRateLimited: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import {
  deactivateStaffAction,
  inviteStaffAction,
  resendInviteAction,
} from '@/app/(admin)/staff/actions'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { createAdminClient } from '@/lib/supabase/admin'

const STAFF_USER = {
  type: 'staff' as const,
  staffUserId: 'staff-1',
  tenantId: 'tenant-1',
  email: 'owner@test.local',
}

const mockTenant = (status: string) => ({ id: 'tenant-1', status, settings: {} })

const inviteUserByEmail = vi.fn()

function inviteForm() {
  const fd = new FormData()
  fd.set('email', 'nuevo@test.local')
  fd.set('firstName', 'Juan')
  fd.set('lastName', 'Perez')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(mockTenant('active') as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(checkPinSessionAction).mockResolvedValue(true)
  inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
  vi.mocked(createAdminClient).mockReturnValue({
    auth: {
      admin: { inviteUserByEmail, updateUserById: vi.fn().mockResolvedValue({}) },
    },
  } as never)
})

describe('staff actions — re-validacion de sesion PIN (#13)', () => {
  it('inviteStaffAction rechaza si la sesion PIN expiro', async () => {
    vi.mocked(checkPinSessionAction).mockResolvedValue(false)
    const res = await inviteStaffAction(inviteForm())
    expect(res).toEqual({ success: false, error: 'PIN requerido.' })
    expect(adminRateLimited).not.toHaveBeenCalled()
  })

  it('deactivateStaffAction rechaza si la sesion PIN expiro', async () => {
    vi.mocked(checkPinSessionAction).mockResolvedValue(false)
    const res = await deactivateStaffAction('member-1')
    expect(res).toEqual({ success: false, error: 'PIN requerido.' })
    expect(adminRateLimited).not.toHaveBeenCalled()
  })

  it('resendInviteAction rechaza si la sesion PIN expiro', async () => {
    vi.mocked(checkPinSessionAction).mockResolvedValue(false)
    const res = await resendInviteAction('miembro@test.local')
    expect(res).toEqual({ success: false, error: 'PIN requerido.' })
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })
})

describe('staff actions — estado del tenant / kill-switch (#14)', () => {
  it.each(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])(
    'inviteStaffAction rechaza tenant en estado %s',
    async (status) => {
      vi.mocked(getStaffTenant).mockResolvedValue(mockTenant(status) as never)
      const res = await inviteStaffAction(inviteForm())
      expect(res).toEqual({ success: false, error: 'El complejo no está activo.' })
      expect(adminRateLimited).not.toHaveBeenCalled()
    },
  )

  it('deactivateStaffAction rechaza tenant bloqueado', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(mockTenant('blocked') as never)
    const res = await deactivateStaffAction('member-1')
    expect(res).toEqual({ success: false, error: 'El complejo no está activo.' })
  })
})

describe('resendInviteAction — verificacion de membership (#12)', () => {
  it('rechaza un email que no es miembro activo del tenant', async () => {
    vi.mocked(withTenantContext).mockResolvedValue([])
    const res = await resendInviteAction('ajeno@otro.local')
    expect(res).toEqual({
      success: false,
      error: 'Este email no es un miembro activo del complejo.',
    })
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('rechaza un email con formato invalido sin tocar la DB', async () => {
    const res = await resendInviteAction('no-es-email')
    expect(res).toEqual({ success: false, error: 'Email inválido.' })
    expect(withTenantContext).not.toHaveBeenCalled()
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('reenvia a un miembro activo, normalizando el email a minuscula', async () => {
    vi.mocked(withTenantContext).mockResolvedValue([{ id: 'member-1' }])
    const res = await resendInviteAction('Miembro@Test.Local')
    expect(res).toEqual({ success: true })
    expect(inviteUserByEmail).toHaveBeenCalledWith('miembro@test.local', expect.any(Object))
  })
})

describe('staff actions — happy path supera los guards', () => {
  it('con PIN valido y tenant activo, deactivate avanza al rate-limit + DB', async () => {
    vi.mocked(withTenantContext).mockResolvedValue({ success: true })
    const res = await deactivateStaffAction('member-1')
    expect(adminRateLimited).toHaveBeenCalledWith('tenant-1')
    expect(res).toEqual({ success: true })
  })
})
