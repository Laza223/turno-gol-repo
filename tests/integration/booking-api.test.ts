import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, and, sql as drizzleSql } from 'drizzle-orm'
import {
  closeSql,
  getDb,
  getSql,
  withPlayerContext,
  withTenantContext,
} from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { PlayerBannedError } from '@/modules/bookings/booking.errors'
import { bookings, courts, playerTenantRelationships } from '@/shared/db/schema'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

const FUTURE_DATE = '2099-06-15'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha API Test'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function getPTR(tenantId: string, playerId: string) {
  const db = getDb()
  const rows = await db
    .select()
    .from(playerTenantRelationships)
    .where(
      and(
        eq(playerTenantRelationships.tenantId, tenantId),
        eq(playerTenantRelationships.playerId, playerId),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

beforeAll(async () => {
  setExpiryScheduler(async () => {})
  await ensureRoles()
})

afterAll(async () => {
  setExpiryScheduler(null)
  await cleanupAll()
  await closeSql()
})

describe('createOnlineBooking — PTR upsert', () => {
  it('no deposit → confirmed + PTR created (bookings_count=1)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    // Use withPlayerContext + set tenant_id context to satisfy RLS
    const booking = await withPlayerContext(player.id, async (tx) => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
      )
      return createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '10:00',
          timeEnd: '11:00',
          durationMins: 60,
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      )
    })

    expect(booking.status).toBe('confirmed')
    expect(booking.depositStatus).toBe('not_required')

    const ptr = await getPTR(tenant.id, player.id)
    expect(ptr).not.toBeNull()
    expect(ptr!.bookingsCount).toBe(1)
    expect(ptr!.lastBookingAt).not.toBeNull()
  })

  it('with deposit → pending_payment + PTR created', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    const booking = await withPlayerContext(player.id, async (tx) => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
      )
      return createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '11:00',
          timeEnd: '12:00',
          durationMins: 60,
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      )
    })

    expect(booking.status).toBe('pending_payment')
    expect(booking.depositStatus).toBe('pending')
    expect(booking.depositAmount).toBe(240000) // 800000 * 30%
    expect(booking.paymentMethod).toBeNull()

    const ptr = await getPTR(tenant.id, player.id)
    expect(ptr).not.toBeNull()
    expect(ptr!.bookingsCount).toBe(1)
  })

  it('second booking by same player increments PTR bookings_count to 2', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    const baseInput = {
      playerId: player.id,
      courtId,
      date: FUTURE_DATE,
      durationMins: 60 as const,
      requiresDeposit: false,
      depositPercentage: 0,
    }

    await withPlayerContext(player.id, async (tx) => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
      )
      await createOnlineBooking(
        tenant.id,
        { ...baseInput, timeStart: '14:00', timeEnd: '15:00' },
        tx,
      )
    })

    await withPlayerContext(player.id, async (tx) => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
      )
      await createOnlineBooking(
        tenant.id,
        { ...baseInput, timeStart: '15:00', timeEnd: '16:00' },
        tx,
      )
    })

    const ptr = await getPTR(tenant.id, player.id)
    expect(ptr!.bookingsCount).toBe(2)
  })

  it('banned player → PlayerBannedError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    // Insert active ban
    await sql`
      INSERT INTO tenant_player_bans (tenant_id, player_id, reason)
      VALUES (${tenant.id}, ${player.id}, 'Test ban')
    `

    await expect(
      withPlayerContext(player.id, async (tx) => {
        await tx.execute(
          drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
        )
        return createOnlineBooking(
          tenant.id,
          {
            playerId: player.id,
            courtId,
            date: FUTURE_DATE,
            timeStart: '16:00',
            timeEnd: '17:00',
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        )
      }),
    ).rejects.toBeInstanceOf(PlayerBannedError)
  })
})

describe('GET bookings list — cursor pagination', () => {
  it('returns enriched list with court name and cursor for next page', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    // Create 3 bookings via SQL directly (bypass service for speed)
    for (const [start, end] of [['08:00', '09:00'], ['09:00', '10:00'], ['10:00', '11:00']]) {
      await sql`
        INSERT INTO bookings (
          tenant_id, court_id, player_id, date, time_start, time_end,
          price_snapshot, deposit_amount, deposit_status, payment_method, status, type
        ) VALUES (
          ${tenant.id}, ${courtId}, ${player.id},
          ${FUTURE_DATE}::date, ${start}::time, ${end}::time,
          ${800000}, ${0}, 'not_required', NULL, 'confirmed', 'spontaneous'
        )
      `
    }

    const db = getDb()
    const dateStr = FUTURE_DATE

    // Fetch page 1 (limit 2)
    const page1 = await withTenantContext(tenant.id, (tx) =>
      tx
        .select({ booking: bookings, courtName: courts.name })
        .from(bookings)
        .leftJoin(courts, eq(bookings.courtId, courts.id))
        .where(
          and(
            eq(bookings.tenantId, tenant.id),
            drizzleSql`${bookings.date} = ${dateStr}::date`,
          ),
        )
        .orderBy(drizzleSql`${bookings.createdAt} DESC, ${bookings.id} DESC`)
        .limit(3),
    )

    expect(page1.length).toBe(3)
    // All have court name
    expect(page1[0]!.courtName).toBe('Cancha API Test')
    // Ordered newest first
    expect(page1[0]!.booking.timeStart).toBe('10:00:00')
  })
})
