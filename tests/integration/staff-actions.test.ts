import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// DB stays real (withTenantContext); only the auth + external boundary is mocked.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))

const inviteUserByEmail = vi.fn()
const updateUserById = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { inviteUserByEmail, updateUserById } } }),
}))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import {
  deactivateStaffAction,
  inviteStaffAction,
  updateStaffRoleAction,
} from '@/app/(admin)/settings/equipo/actions'

function asStaff(tenantId: string, staffUserId: string) {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'owner@test.local',
    staffUserId,
    tenantId,
    role: 'admin',
  })
  vi.mocked(getStaffTenant).mockResolvedValue({ id: tenantId, status: 'active' } as never)
}

beforeAll(async () => {
  await ensureRoles()
})
beforeEach(async () => {
  vi.clearAllMocks()
  inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'new-auth-id' } }, error: null })
  updateUserById.mockResolvedValue({ data: {}, error: null })
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('deactivateStaffAction', () => {
  it('prevents deactivating the last active admin', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    const memberId = await linkStaffToTenant(sql, tenant.id, staff.id)
    asStaff(tenant.id, staff.id)

    const res = await deactivateStaffAction(memberId)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('al menos un admin')
  })

  it('deactivates a member when more than one is active', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const s1 = await createTestStaffUser(sql)
    const s2 = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, s1.id)
    const m2 = await linkStaffToTenant(sql, tenant.id, s2.id)
    asStaff(tenant.id, s1.id)

    const res = await deactivateStaffAction(m2)
    expect(res.success).toBe(true)

    const rows = await sql<{ is_active: boolean }[]>`
      SELECT is_active FROM tenant_staff_members WHERE id = ${m2}
    `
    expect(rows[0]!.is_active).toBe(false)
  })
})

describe('deactivateStaffAction — lockout de admins (roles 026)', () => {
  it('bloquea desactivar al último admin activo aunque queden encargados', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const manager = await createTestStaffUser(sql)
    const adminMemberId = await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    asStaff(tenant.id, admin.id)

    const res = await deactivateStaffAction(adminMemberId)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('al menos un admin')
  })

  it('permite desactivar un encargado aunque sea el único no-admin', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const manager = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    const managerMemberId = await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    asStaff(tenant.id, admin.id)

    const res = await deactivateStaffAction(managerMemberId)
    expect(res.success).toBe(true)
  })

  it('permite desactivar un admin si queda otro admin activo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const a1 = await createTestStaffUser(sql)
    const a2 = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, a1.id, 'admin')
    const m2 = await linkStaffToTenant(sql, tenant.id, a2.id, 'admin')
    asStaff(tenant.id, a1.id)

    const res = await deactivateStaffAction(m2)
    expect(res.success).toBe(true)
  })
})

describe('updateStaffRoleAction', () => {
  it('cambia el rol de otro miembro y queda en la DB', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const other = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    const otherMemberId = await linkStaffToTenant(sql, tenant.id, other.id, 'manager')
    asStaff(tenant.id, admin.id)

    const res = await updateStaffRoleAction(otherMemberId, 'admin')
    expect(res.success).toBe(true)

    const rows = await sql<{ role: string }[]>`
      SELECT role FROM tenant_staff_members WHERE id = ${otherMemberId}
    `
    expect(rows[0]?.role).toBe('admin')
  })

  it('bloquea cambiarse el rol a sí mismo (protección lockout)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const other = await createTestStaffUser(sql)
    const selfMemberId = await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    await linkStaffToTenant(sql, tenant.id, other.id, 'admin')
    asStaff(tenant.id, admin.id)

    const res = await updateStaffRoleAction(selfMemberId, 'manager')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('propio rol')

    const rows = await sql<{ role: string }[]>`
      SELECT role FROM tenant_staff_members WHERE id = ${selfMemberId}
    `
    expect(rows[0]?.role).toBe('admin')
  })

  it('rechaza un rol fuera del enum', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const other = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    const otherMemberId = await linkStaffToTenant(sql, tenant.id, other.id, 'manager')
    asStaff(tenant.id, admin.id)

    const res = await updateStaffRoleAction(otherMemberId, 'superadmin')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Rol inválido')
  })

  it('devuelve error para un miembro de otro tenant', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const otherTenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const foreign = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    const foreignMemberId = await linkStaffToTenant(sql, otherTenant.id, foreign.id, 'manager')
    asStaff(tenant.id, admin.id)

    const res = await updateStaffRoleAction(foreignMemberId, 'manager')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Miembro no encontrado')
  })
})

describe('staff actions — solo un admin gestiona el equipo (roles 026)', () => {
  it('inviteStaffAction rechaza a un actor Encargado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const manager = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    asStaff(tenant.id, manager.id)

    const fd = new FormData()
    fd.set('email', 'colado@staff.local')
    fd.set('firstName', 'Co')
    fd.set('lastName', 'Lado')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Solo un administrador')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('updateStaffRoleAction rechaza a un actor Encargado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const manager = await createTestStaffUser(sql)
    const adminMemberId = await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    asStaff(tenant.id, manager.id)

    const res = await updateStaffRoleAction(adminMemberId, 'manager')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Solo un administrador')

    const rows = await sql<{ role: string }[]>`
      SELECT role FROM tenant_staff_members WHERE id = ${adminMemberId}
    `
    expect(rows[0]?.role).toBe('admin')
  })

  it('deactivateStaffAction rechaza a un actor Encargado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const viewer = await createTestStaffUser(sql)
    const adminMemberId = await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    await linkStaffToTenant(sql, tenant.id, viewer.id, 'manager')
    asStaff(tenant.id, viewer.id)

    const res = await deactivateStaffAction(adminMemberId)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Solo un administrador')
  })
})

describe('inviteStaffAction', () => {
  it('returns error if the email is already an active member', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    const existing = await createTestStaffUser(sql, { email: 'dup@staff.local' })
    await linkStaffToTenant(sql, tenant.id, existing.id)
    asStaff(tenant.id, owner.id)

    const fd = new FormData()
    fd.set('email', 'dup@staff.local')
    fd.set('firstName', 'Du')
    fd.set('lastName', 'Plicado')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('ya es miembro')
  })

  it('guarda el rol seleccionado en la DB y en el claim del auth user', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    asStaff(tenant.id, owner.id)

    const fd = new FormData()
    fd.set('email', 'segundo-admin@staff.local')
    fd.set('firstName', 'Segundo')
    fd.set('lastName', 'Admin')
    fd.set('role', 'admin')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(true)

    const rows = await sql<{ role: string }[]>`
      SELECT tsm.role FROM tenant_staff_members tsm
      JOIN staff_users su ON su.id = tsm.staff_user_id
      WHERE su.email = 'segundo-admin@staff.local' AND tsm.tenant_id = ${tenant.id}
    `
    expect(rows[0]?.role).toBe('admin')
    expect(updateUserById).toHaveBeenCalledWith(
      'new-auth-id',
      expect.objectContaining({
        app_metadata: expect.objectContaining({ role: 'admin' }),
      }),
    )
  })

  it('defaultea a Encargado (manager) si el form no manda rol', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    asStaff(tenant.id, owner.id)

    const fd = new FormData()
    fd.set('email', 'encargado@staff.local')
    fd.set('firstName', 'En')
    fd.set('lastName', 'Cargado')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(true)

    const rows = await sql<{ role: string }[]>`
      SELECT tsm.role FROM tenant_staff_members tsm
      JOIN staff_users su ON su.id = tsm.staff_user_id
      WHERE su.email = 'encargado@staff.local' AND tsm.tenant_id = ${tenant.id}
    `
    expect(rows[0]?.role).toBe('manager')
  })

  it('rechaza un rol fuera del enum sin tocar la DB', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    asStaff(tenant.id, owner.id)

    const fd = new FormData()
    fd.set('email', 'intruso@staff.local')
    fd.set('firstName', 'In')
    fd.set('lastName', 'Truso')
    fd.set('role', 'superadmin')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Rol inválido')

    const su = await sql<{ id: string }[]>`
      SELECT id FROM staff_users WHERE email = 'intruso@staff.local'
    `
    expect(su).toHaveLength(0)
  })

  it('creates staff_users + tenant_staff_members and sends the invite', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    asStaff(tenant.id, owner.id)

    const fd = new FormData()
    fd.set('email', 'nuevo@staff.local')
    fd.set('firstName', 'Nue')
    fd.set('lastName', 'Vo')

    const res = await inviteStaffAction(fd)
    expect(res.success).toBe(true)
    expect(inviteUserByEmail).toHaveBeenCalledWith('nuevo@staff.local', expect.any(Object))

    const su = await sql<
      { id: string }[]
    >`SELECT id FROM staff_users WHERE email = 'nuevo@staff.local'`
    expect(su).toHaveLength(1)
    const tsm = await sql<{ id: string }[]>`
      SELECT id FROM tenant_staff_members
      WHERE staff_user_id = ${su[0]!.id} AND tenant_id = ${tenant.id} AND is_active = true
    `
    expect(tsm).toHaveLength(1)
  })
})
