import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestSystemAdmin, ensureRoles } from '../helpers/tenant'

type AuditRow = {
  tenant_id: string | null
  actor_id: string
  actor_type: string
  action: string
  resource_type: string
  resource_id: string
  metadata: Record<string, unknown>
}

async function auditRowsFor(adminId: string): Promise<AuditRow[]> {
  const sql = getSql()
  return sql<AuditRow[]>`
    SELECT tenant_id, actor_id, actor_type, action, resource_type, resource_id, metadata
    FROM audit_logs
    WHERE resource_id = ${adminId} AND resource_type = 'system_admin'
    ORDER BY created_at ASC
  `
}

const createdAdminIds: string[] = []

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(async () => {
  // Service-role/postgres connection can DELETE for test cleanup even though
  // audit_logs REVOKEs UPDATE/DELETE from the app role.
  const sql = getSql()
  for (const id of createdAdminIds) {
    await sql`DELETE FROM audit_logs WHERE resource_id = ${id} AND resource_type = 'system_admin'`
    await sql`DELETE FROM system_admins WHERE id = ${id}`
  }
  createdAdminIds.length = 0
})

afterAll(async () => {
  await closeSql()
})

describe('system_admins audit trigger', () => {
  it('INSERT → one system-scoped system_admin.created audit row', async () => {
    const sql = getSql()
    const admin = await createTestSystemAdmin(sql)
    createdAdminIds.push(admin.id)

    const rows = await auditRowsFor(admin.id)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.action).toBe('system_admin.created')
    expect(row.tenant_id).toBeNull()
    expect(row.actor_type).toBe('system')
    expect(row.resource_type).toBe('system_admin')
    expect(row.resource_id).toBe(admin.id)
    expect(row.metadata.email).toBe(admin.email)
  })

  it('UPDATE status active→inactive → system_admin.updated with status change', async () => {
    const sql = getSql()
    const admin = await createTestSystemAdmin(sql)
    createdAdminIds.push(admin.id)

    await sql`UPDATE system_admins SET status = 'inactive' WHERE id = ${admin.id}`

    const rows = await auditRowsFor(admin.id)
    const updated = rows.find((r) => r.action === 'system_admin.updated')
    expect(updated).toBeDefined()
    const meta = updated!.metadata
    const changedFields = meta.changed_fields as Record<string, unknown>
    expect(Object.keys(changedFields)).toContain('status')
    expect(meta.status_was).toBe('active')
    expect(meta.status_now).toBe('inactive')
  })

  it('UPDATE mfa_secret → changed_fields does NOT contain mfa_secret', async () => {
    const sql = getSql()
    const admin = await createTestSystemAdmin(sql)
    createdAdminIds.push(admin.id)

    await sql`UPDATE system_admins SET mfa_secret = 'super-secret-totp' WHERE id = ${admin.id}`

    const rows = await auditRowsFor(admin.id)
    const updated = rows.find((r) => r.action === 'system_admin.updated')
    expect(updated).toBeDefined()
    const changedFields = updated!.metadata.changed_fields as Record<string, unknown>
    expect(Object.keys(changedFields)).not.toContain('mfa_secret')
  })

  it('DELETE → system_admin.deleted audit row', async () => {
    const sql = getSql()
    const admin = await createTestSystemAdmin(sql)
    createdAdminIds.push(admin.id)

    await sql`DELETE FROM system_admins WHERE id = ${admin.id}`

    const rows = await auditRowsFor(admin.id)
    const deleted = rows.find((r) => r.action === 'system_admin.deleted')
    expect(deleted).toBeDefined()
    expect(deleted!.tenant_id).toBeNull()
    expect(deleted!.actor_type).toBe('system')
    expect((deleted!.metadata as { email?: string }).email).toBe(admin.email)
  })
})
