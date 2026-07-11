import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import {
  closeSql,
  getSql,
  withPlayerContext,
  withTenantContext,
} from '@/shared/db/client'
import { bookings } from '@/shared/db/schema'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  type TestPlayer,
  type TestTenant,
} from '../helpers/tenant'

describe('Drizzle tenant/player context helpers', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant
  let player: TestPlayer

  beforeAll(async () => {
    await ensureRoles()
    await cleanupAll()
    const sql = getSql()
    tenantA = await createTestTenant(sql, { slug: 'ctx-a' })
    tenantB = await createTestTenant(sql, { slug: 'ctx-b' })
    player = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenantA.id, player.id)
    await linkPlayerToTenant(sql, tenantB.id, player.id)

    const courtA = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity)
      VALUES (${tenantA.id}, 'A1', 10)
      RETURNING id
    `
    const courtB = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity)
      VALUES (${tenantB.id}, 'B1', 10)
      RETURNING id
    `
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        starts_at, ends_at,
        price_snapshot, status
      ) VALUES (
        ${tenantA.id}, ${courtA[0].id}, ${player.id},
        '2026-05-01', '20:00', '21:00',
        ('2026-05-01'::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        ('2026-05-01'::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        10000, 'confirmed'
      )
    `
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        starts_at, ends_at,
        price_snapshot, status
      ) VALUES (
        ${tenantB.id}, ${courtB[0].id}, ${player.id},
        '2026-05-01', '20:00', '21:00',
        ('2026-05-01'::date + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        ('2026-05-01'::date + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        10000, 'confirmed'
      )
    `
  })

  afterAll(async () => {
    await cleanupAll()
    await closeSql()
  })

  it('withTenantContext(A) returns only tenant A bookings', async () => {
    const rows = await withTenantContext(tenantA.id, async (tx) => {
      // Tests connect as superuser (BYPASSRLS); explicitly drop to turnogol_app
      // so RLS policies actually apply within this tx.
      await tx.execute(drizzleSql`SET LOCAL ROLE turnogol_app`)
      return tx.select().from(bookings)
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].tenantId).toBe(tenantA.id)
  })

  it('withTenantContext(B) returns only tenant B bookings', async () => {
    const rows = await withTenantContext(tenantB.id, async (tx) => {
      await tx.execute(drizzleSql`SET LOCAL ROLE turnogol_app`)
      return tx.select().from(bookings)
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].tenantId).toBe(tenantB.id)
  })

  it('withPlayerContext returns only the player\'s own bookings (cross-tenant)', async () => {
    const rows = await withPlayerContext(player.id, async (tx) => {
      await tx.execute(drizzleSql`SET LOCAL ROLE turnogol_app`)
      return tx.select().from(bookings)
    })
    // Player has 1 booking in each of A, B → 2 visible via player_own_bookings_select.
    expect(rows.length).toBe(2)
    for (const row of rows) {
      expect(row.playerId).toBe(player.id)
    }
  })
})
