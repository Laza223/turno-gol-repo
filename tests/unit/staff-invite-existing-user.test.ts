import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const txLimit = vi.fn(async () => [] as unknown[])
  // assertActorIsAdmin (roles 026) consulta select().from().where().limit()
  // sin innerJoin; por default el actor es admin para que el invite avance.
  const actorLimit = vi.fn(async () => [{ role: 'admin' }] as unknown[])
  const insert = vi.fn()
  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: txLimit }) }),
        where: () => ({ limit: actorLimit }),
      }),
    }),
    insert,
  }
  return {
    extractAuthUser: vi.fn(),
    getStaffTenant: vi.fn(),
    adminRateLimited: vi.fn(),
    inviteUserByEmail: vi.fn(),
    updateUserById: vi.fn(),
    listUsers: vi.fn(),
    txLimit,
    actorLimit,
    insert,
    tx,
  }
})

vi.mock('next/navigation', () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT:${u}`)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: h.extractAuthUser }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: h.getStaffTenant }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: h.adminRateLimited }))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: (_t: string, fn: (tx: unknown) => unknown) => fn(h.tx),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: h.inviteUserByEmail,
        updateUserById: h.updateUserById,
        listUsers: h.listUsers,
      },
    },
  }),
}))

import { inviteStaffAction } from '@/app/(admin)/staff/actions'

function makeForm(email = 'new@x.com'): FormData {
  const f = new FormData()
  f.set('email', email)
  f.set('firstName', 'Nuevo')
  f.set('lastName', 'Staff')
  return f
}

const ALREADY = {
  data: { user: null },
  error: { message: 'A user with this email address has already been registered' },
}

beforeEach(() => {
  vi.resetAllMocks()
  h.extractAuthUser.mockResolvedValue({
    type: 'staff',
    staffUserId: 'inviter-1',
    id: 'u',
    email: 'a@b.com',
  })
  h.getStaffTenant.mockResolvedValue({ id: 'tenant-1', status: 'active', settings: {} })
  h.adminRateLimited.mockResolvedValue(null)
  h.txLimit.mockResolvedValue([])
  h.actorLimit.mockResolvedValue([{ role: 'admin' }])
  h.updateUserById.mockResolvedValue({ data: {}, error: null })
  h.insert
    .mockReturnValueOnce({
      values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ id: 'staff-new' }] }) }),
    })
    .mockReturnValueOnce({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    })
})

describe('inviteStaffAction — usuario ya registrado (#47)', () => {
  it('sincroniza staff_user_id preservando el tenant_id/role existentes', async () => {
    h.inviteUserByEmail.mockResolvedValue(ALREADY)
    h.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'auth-existing', email: 'New@X.com', app_metadata: { tenant_id: 'other-tenant', role: 'admin' } },
        ],
      },
      error: null,
    })

    const res = await inviteStaffAction(makeForm('new@x.com'))

    expect(res.success).toBe(true)
    expect(h.updateUserById).toHaveBeenCalledTimes(1)
    expect(h.updateUserById).toHaveBeenCalledWith('auth-existing', {
      app_metadata: { tenant_id: 'other-tenant', role: 'admin', staff_user_id: 'staff-new' },
    })
  })

  it('usuario nuevo en auth recibe el claim completo y no se pagina listUsers', async () => {
    h.inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'auth-new' } }, error: null })

    const res = await inviteStaffAction(makeForm('fresh@x.com'))

    expect(res.success).toBe(true)
    expect(h.listUsers).not.toHaveBeenCalled()
    // El form de makeForm no manda rol → default Encargado (manager).
    expect(h.updateUserById).toHaveBeenCalledWith('auth-new', {
      app_metadata: { staff_user_id: 'staff-new', tenant_id: 'tenant-1', role: 'manager' },
    })
  })

  it('si el usuario existente no se ubica, no llama updateUserById y no falla', async () => {
    h.inviteUserByEmail.mockResolvedValue(ALREADY)
    h.listUsers.mockResolvedValue({ data: { users: [] }, error: null })

    const res = await inviteStaffAction(makeForm())

    expect(res.success).toBe(true)
    expect(h.updateUserById).not.toHaveBeenCalled()
  })
})
