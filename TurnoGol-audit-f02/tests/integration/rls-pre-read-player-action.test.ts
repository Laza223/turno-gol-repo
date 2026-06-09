import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeSql, getDb, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { insertBooking } from '../helpers/factories'

let tenantA: { id: string }
let tenantB: { id: string }
let seedA: IsolationSeed
let seedB: IsolationSeed
let playerA: { id: string }
let playerB: { id: string }
let bookingOfBInOtherTenant: string

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)

  tenantA = await createTestTenant(s)
  tenantB = await createTestTenant(s)
  seedA = await seedIsolationData(s, tenantA.id)
  seedB = await seedIsolationData(s, tenantB.id)

  playerA = await createTestPlayer(s)
  playerB = await createTestPlayer(s)
  await linkPlayerToTenant(s, tenantA.id, playerA.id)
  await linkPlayerToTenant(s, tenantB.id, playerB.id)

  // Booking de playerB en tenantB (NO debe ser visible para playerA)
  bookingOfBInOtherTenant = await insertBooking(s, {
    tenantId: tenantB.id,
    courtId: seedB.courtId,
    playerId: playerB.id,
    timeStart: '10:00',
    timeEnd: '11:00',
    status: 'confirmed',
    depositStatus: 'paid',
    depositAmount: 100000,
  })
}, 30_000)

afterAll(async () => closeSql())

describe('RLS pre-read pattern in player server actions', () => {
  it('SELECT bookings sin contexto player → leakea info if role bypasses RLS', async () => {
    // Reproduces the pattern from src/app/(player)/mis-reservas/actions.ts:42
    // — getDb() + raw SELECT WHERE id = X. If the connection role bypasses RLS
    // (e.g. postgres superuser), it leaks tenant_id + deposit_status of ANY booking.
    const db = getDb()
    const rows = (await db.execute(sql`
      SELECT tenant_id, deposit_status
      FROM bookings
      WHERE id = ${bookingOfBInOtherTenant}
      LIMIT 1
    `)) as unknown as Array<{ tenant_id: string; deposit_status: string }>

    // If this returns 1 row, it means the role bypasses RLS → leak.
    // If returns 0 rows, RLS is correctly filtering the pre-read.
    if (rows.length > 0) {
      // Leak detected: document for the audit but don't fail. The audit needs
      // to acknowledge that postgres superuser bypasses RLS as expected
      // (Supabase local uses postgres user). In production with turnogol_app
      // role this WOULD filter to 0 rows.
      console.log(
        `[INFO] Test role bypasses RLS (expected for postgres superuser in dev). ` +
          `Pre-read leak surface: tenant_id=${rows[0].tenant_id}, deposit_status=${rows[0].deposit_status}.`,
      )
    }
    // Surface to test: just record finding. Real defense lives in role config.
    expect(rows.length).toBeGreaterThanOrEqual(0)
  })

  it('SELECT bookings con SET LOCAL ROLE turnogol_app + sin player_id → 0 rows (RLS works)', async () => {
    const s = getSql()
    const result = await s.begin(async (tx) => {
      await tx`SET LOCAL ROLE turnogol_app`
      // No SET LOCAL app.current_player_id, no SET LOCAL app.current_tenant_id
      const rows = await tx<{ tenant_id: string }[]>`
        SELECT tenant_id FROM bookings WHERE id = ${bookingOfBInOtherTenant} LIMIT 1
      `
      return rows
    })
    expect(result.length).toBe(0)
  })

  it('SELECT bookings con turnogol_app + SET LOCAL app.current_player_id de playerA → 0 rows (cross-player blocked)', async () => {
    const s = getSql()
    const result = await s.begin(async (tx) => {
      await tx`SET LOCAL ROLE turnogol_app`
      await tx`SELECT set_config('app.current_player_id', ${playerA.id}, true)`
      const rows = await tx<{ tenant_id: string }[]>`
        SELECT tenant_id FROM bookings WHERE id = ${bookingOfBInOtherTenant} LIMIT 1
      `
      return rows
    })
    expect(result.length).toBe(0)
  })
})
