import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import {
  insertBooking,
  insertCashFlow,
  insertCourt,
  insertNotification,
  insertPayment,
  insertAuditLog,
  insertAbonado,
  insertProduct,
  insertBan,
  insertDailyCashClose,
} from '../helpers/factories'

import { runDataRetentionCleanup } from '@/shared/jobs/workers/data-retention-cleanup.worker'

async function setupTenantWithChildrenAndDeletionSchedule(
  daysAgo: number,
): Promise<{
  tenantId: string
  playerId: string
  staffId: string
  bookingId: string
}> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  await linkStaffToTenant(sql, tenant.id, staff.id)

  const courtId = await insertCourt(sql, tenant.id)
  const bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId,
    playerId: player.id,
  })
  await insertPayment(sql, { tenantId: tenant.id, bookingId, playerId: player.id })
  await insertCashFlow(sql, { tenantId: tenant.id, registeredBy: staff.id, bookingId })
  await insertNotification(sql, {
    tenantId: tenant.id,
    recipientType: 'player',
    recipientId: player.id,
  })
  await insertAuditLog(sql, {
    tenantId: tenant.id,
    actorId: staff.id,
    actorType: 'staff',
    resourceId: bookingId,
  })
  await insertAbonado(sql, tenant.id, courtId)
  await insertProduct(sql, tenant.id)
  await insertBan(sql, { tenantId: tenant.id, playerId: player.id, bannedBy: staff.id })
  await insertDailyCashClose(sql, { tenantId: tenant.id, closedBy: staff.id })

  // MP tokens + scheduled deletion in the past.
  await sql`
    UPDATE tenants
    SET mp_access_token = ${'enc-token'},
        mp_refresh_token = ${'enc-refresh'},
        scheduled_deletion_at = NOW() - INTERVAL '${sql.unsafe(String(daysAgo))} days',
        status = 'churned'::tenant_status
    WHERE id = ${tenant.id}
  `

  return { tenantId: tenant.id, playerId: player.id, staffId: staff.id, bookingId }
}

async function countChildren(sql: ReturnType<typeof getSql>, tenantId: string): Promise<{
  bookings: number
  payments: number
  cashFlows: number
  notifications: number
  auditLogs: number
  abonados: number
  products: number
  bans: number
  closes: number
  courts: number
  staffMembers: number
  playerRels: number
}> {
  const [r] = await sql<
    Array<{
      bookings: string
      payments: string
      cashFlows: string
      notifications: string
      auditLogs: string
      abonados: string
      products: string
      bans: string
      closes: string
      courts: string
      staffMembers: string
      playerRels: string
    }>
  >`
    SELECT
      (SELECT COUNT(*) FROM bookings WHERE tenant_id = ${tenantId})::text AS bookings,
      (SELECT COUNT(*) FROM payments WHERE tenant_id = ${tenantId})::text AS payments,
      (SELECT COUNT(*) FROM cash_flows WHERE tenant_id = ${tenantId})::text AS "cashFlows",
      (SELECT COUNT(*) FROM notifications WHERE tenant_id = ${tenantId})::text AS notifications,
      (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = ${tenantId})::text AS "auditLogs",
      (SELECT COUNT(*) FROM abonados WHERE tenant_id = ${tenantId})::text AS abonados,
      (SELECT COUNT(*) FROM products WHERE tenant_id = ${tenantId})::text AS products,
      (SELECT COUNT(*) FROM tenant_player_bans WHERE tenant_id = ${tenantId})::text AS bans,
      (SELECT COUNT(*) FROM daily_cash_closes WHERE tenant_id = ${tenantId})::text AS closes,
      (SELECT COUNT(*) FROM courts WHERE tenant_id = ${tenantId})::text AS courts,
      (SELECT COUNT(*) FROM tenant_staff_members WHERE tenant_id = ${tenantId})::text AS "staffMembers",
      (SELECT COUNT(*) FROM player_tenant_relationships WHERE tenant_id = ${tenantId})::text AS "playerRels"
  `
  return {
    bookings: Number(r.bookings),
    payments: Number(r.payments),
    cashFlows: Number(r.cashFlows),
    notifications: Number(r.notifications),
    auditLogs: Number(r.auditLogs),
    abonados: Number(r.abonados),
    products: Number(r.products),
    bans: Number(r.bans),
    closes: Number(r.closes),
    courts: Number(r.courts),
    staffMembers: Number(r.staffMembers),
    playerRels: Number(r.playerRels),
  }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  // Cleanup leftover abonado (factory uses random day_of_week) so tests with
  // hard-coded day_of_week (e.g. race-abonado-vs-individual) aren't polluted.
  await cleanupAll(getSql())
  await closeSql()
})

describe('data-retention-cleanup', () => {
  it('wipes all children + soft-anonymizes tenant when scheduled_deletion_at <= NOW()', async () => {
    const { tenantId, playerId } = await setupTenantWithChildrenAndDeletionSchedule(1)
    const sql = getSql()

    const before = await countChildren(sql, tenantId)
    expect(before.bookings).toBe(1)
    expect(before.payments).toBe(1)
    expect(before.notifications).toBe(1)

    await runDataRetentionCleanup()

    const after = await countChildren(sql, tenantId)
    expect(after.bookings).toBe(0)
    expect(after.payments).toBe(0)
    expect(after.cashFlows).toBe(0)
    expect(after.notifications).toBe(0)
    expect(after.auditLogs).toBe(0)
    expect(after.abonados).toBe(0)
    expect(after.products).toBe(0)
    expect(after.bans).toBe(0)
    expect(after.closes).toBe(0)
    expect(after.courts).toBe(0)
    expect(after.staffMembers).toBe(0)
    expect(after.playerRels).toBe(0)

    const [tenant] = await sql<
      Array<{
        status: string
        name: string
        email: string
        mp_access_token: string | null
        scheduled_deletion_at: Date | null
      }>
    >`
      SELECT status, name, email, mp_access_token, scheduled_deletion_at
      FROM tenants WHERE id = ${tenantId}
    `
    expect(tenant.status).toBe('deleted')
    expect(tenant.name).toBe('[deleted]')
    expect(tenant.email).toMatch(/^deleted-.*@anon\.local$/)
    expect(tenant.mp_access_token).toBeNull()
    expect(tenant.scheduled_deletion_at).toBeNull()

    // Player record itself NOT deleted (cross-tenant, Ley 25.326).
    const [playerRow] = await sql<{ id: string }[]>`
      SELECT id FROM players WHERE id = ${playerId}
    `
    expect(playerRow?.id).toBe(playerId)
  }, 60_000)

  it('does NOT touch tenant without scheduled_deletion_at', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    const courtId = await insertCourt(sql, tenant.id)
    await insertBooking(sql, { tenantId: tenant.id, courtId, playerId: player.id })

    await runDataRetentionCleanup()

    const [row] = await sql<{ status: string; name: string }[]>`
      SELECT status, name FROM tenants WHERE id = ${tenant.id}
    `
    expect(row.status).not.toBe('deleted')
    expect(row.name).not.toBe('[deleted]')

    const after = await countChildren(sql, tenant.id)
    expect(after.bookings).toBe(1)
  }, 30_000)

  it('idempotent: running 2x sequentially keeps tenant in deleted state, no error', async () => {
    const { tenantId } = await setupTenantWithChildrenAndDeletionSchedule(2)

    await runDataRetentionCleanup()
    await runDataRetentionCleanup() // second pass: target list is empty.

    const sql = getSql()
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('deleted')
  }, 60_000)
})
