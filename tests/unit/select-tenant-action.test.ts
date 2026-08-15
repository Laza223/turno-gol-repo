import { beforeEach, describe, expect, it, vi } from 'vitest'

const { extractAuthUser, resolveStaffTenants, refreshSession, adminUpdateUserById, redirect } =
  vi.hoisted(() => ({
    extractAuthUser: vi.fn(),
    resolveStaffTenants: vi.fn(),
    refreshSession: vi.fn(async () => ({ error: null })),
    adminUpdateUserById: vi.fn(async () => ({ error: null })),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`)
    }),
  }))

vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser }))
// Solo se mockea resolveStaffTenants (hace una query real); setStaffTenantClaim
// se deja REAL para poder verificar qué le manda a adminUpdateUserById.
vi.mock('@/modules/auth/auth.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/auth.service')>()
  return { ...actual, resolveStaffTenants }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { refreshSession } }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById: adminUpdateUserById } } }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/shared/observability', () => ({
  track: { auth: vi.fn() },
  withSpan: (_name: string, _op: string, fn: () => Promise<unknown>) => fn(),
}))

import { selectTenantAction } from '@/app/select-tenant/actions'

const staffUser = {
  type: 'staff' as const,
  id: 'auth-u1',
  email: 'marce@complejo.com',
  staffUserId: 'staff-1',
  tenantId: null,
  role: 'admin' as const,
}

const TENANT_1 = '11111111-1111-1111-1111-111111111111'
const TENANT_2 = '22222222-2222-2222-2222-222222222222'

const tenants = [
  {
    tenantId: TENANT_1,
    tenantName: 'Canchas del Sur',
    tenantSlug: 'canchas-del-sur',
    role: 'admin',
  },
  { tenantId: TENANT_2, tenantName: 'El Predio', tenantSlug: 'el-predio', role: 'admin' },
]

function fd(tenantId: string): FormData {
  const f = new FormData()
  f.set('tenantId', tenantId)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  extractAuthUser.mockResolvedValue(staffUser)
  resolveStaffTenants.mockResolvedValue(tenants)
})

describe('selectTenantAction', () => {
  // Caminos tempranos: son previos a cualquier mutación de cookie, así que
  // siguen usando redirect() real — sin cambios de comportamiento acá.
  it('tenantId inválido (no-uuid) → redirect a ?error=invalid, sin tocar sesión', async () => {
    await expect(selectTenantAction({ status: 'idle' }, fd('no-es-un-uuid'))).rejects.toThrow(
      'REDIRECT:/select-tenant?error=invalid',
    )
    expect(extractAuthUser).not.toHaveBeenCalled()
  })

  it('sin sesión de staff → redirect a /login', async () => {
    extractAuthUser.mockResolvedValueOnce(null)
    await expect(
      selectTenantAction({ status: 'idle' }, fd('11111111-1111-1111-1111-111111111111')),
    ).rejects.toThrow('REDIRECT:/login')
  })

  it('tenant al que el staff no pertenece → redirect a ?error=invalid', async () => {
    await expect(
      selectTenantAction({ status: 'idle' }, fd('99999999-9999-9999-9999-999999999999')),
    ).rejects.toThrow('REDIRECT:/select-tenant?error=invalid')
    expect(adminUpdateUserById).not.toHaveBeenCalled()
  })

  // Camino de éxito: ya NO redirige server-side (carrera cookie/WebKit, ver
  // actions.ts) — devuelve el estado para que el cliente navegue con
  // window.location.assign.
  it('tenant válido → setea el claim, refresca sesión y devuelve success', async () => {
    const res = await selectTenantAction({ status: 'idle' }, fd(TENANT_1))
    expect(res).toEqual({ status: 'success', path: '/dashboard' })
    expect(adminUpdateUserById).toHaveBeenCalledWith(
      'auth-u1',
      expect.objectContaining({
        app_metadata: expect.objectContaining({ tenant_id: TENANT_1, staff_user_id: 'staff-1' }),
      }),
    )
    expect(refreshSession).toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})
