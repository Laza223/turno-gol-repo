import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  anonymizePlayer,
  PlayerAlreadyAnonymizedError,
  PlayerNotFoundError,
} from '@/modules/players/player.anonymization'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  createTestStaffUser,
  linkPlayerToTenant,
  linkStaffToTenant,
  ensureRoles,
} from '../helpers/tenant'

let sql: ReturnType<typeof getSql>

beforeAll(async () => {
  sql = getSql()
  await ensureRoles(sql)
})
beforeEach(async () => { await cleanupAll(sql) })
afterAll(async () => { await cleanupAll(sql); await closeSql() })

describe('anonymizePlayer', () => {
  it('replaces PII and sets status to anonymized', async () => {
    const player = await createTestPlayer(sql)

    await anonymizePlayer(player.id)

    const rows = await sql<Array<{
      status: string
      email: string
      first_name: string
      last_name: string
      phone: string | null
      avatar_url: string | null
      agreed_to_terms_at: Date | null
    }>>`SELECT status, email, first_name, last_name, phone, avatar_url, agreed_to_terms_at FROM players WHERE id = ${player.id}`

    const row = rows[0]!
    expect(row.status).toBe('anonymized')
    expect(row.email).toBe(`anon-${player.id}@anon.local`)
    expect(row.first_name).toBe('[eliminado]')
    expect(row.last_name).toBe('[eliminado]')
    expect(row.phone).toBeNull()
    expect(row.avatar_url).toBeNull()
    expect(row.agreed_to_terms_at).toBeNull()
  })

  it('deletes player_tenant_relationships', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    await linkPlayerToTenant(sql, tenant.id, player.id)

    const beforeRels = await sql`SELECT id FROM player_tenant_relationships WHERE player_id = ${player.id}`
    expect(beforeRels).toHaveLength(1)

    await anonymizePlayer(player.id)

    const afterRels = await sql`SELECT id FROM player_tenant_relationships WHERE player_id = ${player.id}`
    expect(afterRels).toHaveLength(0)
  })

  it('deletes tenant_player_bans', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await sql`INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_by)
              VALUES (${tenant.id}, ${player.id}, 'test ban', ${staff.id})`

    await anonymizePlayer(player.id)

    const bans = await sql`SELECT id FROM tenant_player_bans WHERE player_id = ${player.id}`
    expect(bans).toHaveLength(0)
  })

  it('nullifies player_id on bookings (preserves booking rows)', async () => {
    const player = await createTestPlayer(sql)
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courts = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, surface_type, capacity, pricing)
      VALUES (${tenant.id}, 'Cancha 1', 'synthetic_grass', 10, '{"rules":[]}')
      RETURNING id
    `
    const courtId = courts[0]!.id
    await sql`
      INSERT INTO bookings (tenant_id, court_id, player_id, date, time_start, time_end, price_snapshot, status, type)
      VALUES (${tenant.id}, ${courtId}, ${player.id}, '2026-06-01', '18:00', '19:00', 800000, 'confirmed', 'spontaneous')
    `

    await anonymizePlayer(player.id)

    const bookings = await sql<{ player_id: string | null }[]>`
      SELECT player_id FROM bookings WHERE tenant_id = ${tenant.id}
    `
    expect(bookings).toHaveLength(1)
    expect(bookings[0]!.player_id).toBeNull()
  })

  it('creates audit log per affected tenant', async () => {
    const player = await createTestPlayer(sql)
    const t1 = await createTestTenant(sql)
    const t2 = await createTestTenant(sql)
    await linkPlayerToTenant(sql, t1.id, player.id)
    await linkPlayerToTenant(sql, t2.id, player.id)

    await anonymizePlayer(player.id)

    const logs = await sql<{ tenant_id: string; action: string }[]>`
      SELECT tenant_id, action FROM audit_logs WHERE resource_id = ${player.id} AND action = 'player.anonymized'
    `
    expect(logs).toHaveLength(2)
    const tenantIds = logs.map((l) => l.tenant_id).sort()
    expect(tenantIds).toEqual([t1.id, t2.id].sort())
  })

  it('throws PlayerNotFoundError for unknown id', async () => {
    await expect(anonymizePlayer('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      PlayerNotFoundError,
    )
  })

  it('throws PlayerAlreadyAnonymizedError on second call', async () => {
    const player = await createTestPlayer(sql)
    await anonymizePlayer(player.id)
    await expect(anonymizePlayer(player.id)).rejects.toThrow(PlayerAlreadyAnonymizedError)
  })
})
