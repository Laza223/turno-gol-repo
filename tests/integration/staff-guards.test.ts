import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// DB real (getStaffTenant + getStaffRole leen tenant_staff_members de verdad);
// solo se mockea el boundary de auth y el redirect de Next.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { requireAdminStaff } from '@/modules/staff/guards'
import { getStaffRole } from '@/modules/staff/staff.service'

function asStaff(tenantId: string, staffUserId: string) {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'staff@test.local',
    staffUserId,
    tenantId,
    role: 'admin',
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await ensureRoles()
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('getStaffRole', () => {
  it('devuelve el rol del miembro activo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id, 'manager')

    expect(await getStaffRole(tenant.id, staff.id)).toBe('manager')
  })

  it('devuelve null si el miembro no existe o está inactivo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)

    expect(await getStaffRole(tenant.id, staff.id)).toBeNull()
  })
})

describe('requireAdminStaff — Configuración solo para admins', () => {
  it('deja pasar a un admin y devuelve user + tenant', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    asStaff(tenant.id, admin.id)

    const result = await requireAdminStaff()
    expect(result.tenant.id).toBe(tenant.id)
    expect(result.user.staffUserId).toBe(admin.id)
  })

  it('redirige a /dashboard a un Encargado (manager)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const manager = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    asStaff(tenant.id, manager.id)

    await expect(requireAdminStaff()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('redirige a /login si no hay sesión staff', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(null)
    await expect(requireAdminStaff()).rejects.toThrow('REDIRECT:/login')
  })
})
