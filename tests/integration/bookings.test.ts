import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  closeSql,
  getDb,
  getSql,
  withTenantContext,
} from '@/shared/db/client'
import {
  completeBooking,
  createManualBooking,
  createOnlineBooking,
  expirePendingBooking,
  markNoShow,
} from '@/modules/bookings/booking.service'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import {
  BookingNotInConfirmedError,
  CourtOfflineError,
  SlotTakenError,
} from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { sql as drizzleSql } from 'drizzle-orm'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 800000, '120': 1500000 },
    },
  ],
}

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Test'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function setCourtOffline(courtId: string): Promise<void> {
  const sql = getSql()
  await sql`UPDATE courts SET status = 'offline' WHERE id = ${courtId}`
}

async function insertPendingBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  date: string
  timeStart: string
  timeEnd: string
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${800000}, ${0}, 'not_required', NULL, 'pending_payment'
    )
    RETURNING id
  `
  return rows[0]!.id
}

const FUTURE_DATE = '2027-04-26' // Monday, far in the future

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('createManualBooking', () => {
  it('happy path: confirms booking with captured price_snapshot', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: FUTURE_DATE,
          timeStart: '14:00',
          timeEnd: '15:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
          guestName: 'Juan Pérez',
          guestPhone: '11-1234-5678',
        },
        tx,
      ),
    )

    expect(booking.status).toBe('confirmed')
    expect(booking.priceSnapshot).toBe(800000)
    expect(booking.createdByStaff).toBe(staff.id)
    expect(booking.guestName).toBe('Juan Pérez')
  })

  it('court offline → CourtOfflineError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setCourtOffline(courtId)

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createManualBooking(
          tenant.id,
          {
            courtId,
            date: FUTURE_DATE,
            timeStart: '14:00',
            timeEnd: '15:00',
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: staff.id,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(CourtOfflineError)
  })

  it('priceOverride=0 is accepted (cortesía)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: FUTURE_DATE,
          timeStart: '10:00',
          timeEnd: '11:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
          priceOverride: 0,
        },
        tx,
      ),
    )

    expect(booking.priceSnapshot).toBe(0)
    expect(booking.status).toBe('confirmed')
  })

  it('overlap → SlotTakenError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: FUTURE_DATE,
          timeStart: '14:00',
          timeEnd: '15:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
        },
        tx,
      ),
    )

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createManualBooking(
          tenant.id,
          {
            courtId,
            date: FUTURE_DATE,
            timeStart: '14:30',
            timeEnd: '15:30',
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: staff.id,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(SlotTakenError)
  })
})

describe('createOnlineBooking', () => {
  it('without deposit → confirmed', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
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
      ),
    )

    expect(booking.status).toBe('confirmed')
    expect(booking.depositStatus).toBe('not_required')
    expect(booking.priceSnapshot).toBe(800000)
  })

  it('requiresDeposit=true → pending_payment with deposit_amount calculated', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '18:00',
          timeEnd: '19:00',
          durationMins: 60,
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    )

    expect(booking.status).toBe('pending_payment')
    expect(booking.depositStatus).toBe('pending')
    expect(booking.depositAmount).toBe(240000) // 800000 * 30%
    expect(booking.paymentMethod).toBeNull()
  })
})

describe('exclusion constraint safety net', () => {
  it('direct INSERT bypassing service → no_overlapping_bookings (errcode 23P01)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '14:00',
      timeEnd: '15:00',
    })

    let caught: { code?: string } | null = null
    try {
      await insertPendingBooking({
        tenantId: tenant.id,
        courtId,
        playerId: player.id,
        date: FUTURE_DATE,
        timeStart: '14:30',
        timeEnd: '15:30',
      })
    } catch (e) {
      caught = e as { code?: string }
    }
    expect(caught).not.toBeNull()
    expect(caught?.code).toBe('23P01')
  })
})

describe('price_snapshot inmutabilidad (trigger DB)', () => {
  it('UPDATE price_snapshot is rejected', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '20:00',
      timeEnd: '21:00',
    })

    await expect(
      sql`UPDATE bookings SET price_snapshot = 999 WHERE id = ${bookingId}`,
    ).rejects.toThrow(/price_snapshot/i)
  })
})

describe('terminal state inmutabilidad', () => {
  it('UPDATE on expired booking is rejected by trigger', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '21:00',
      timeEnd: '22:00',
    })

    // Expire it via the concurrency primitive.
    const result = await withTenantContext(tenant.id, (tx) =>
      transitionFromPendingPayment(bookingId, 'expired', tx),
    )
    expect(result.won).toBe(true)

    // Any subsequent UPDATE must be rejected by trigger.
    await expect(
      sql`UPDATE bookings SET notes_internal = 'foo' WHERE id = ${bookingId}`,
    ).rejects.toThrow(/terminal/i)
  })
})

describe('completeBooking', () => {
  it('confirmed → completed', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const created = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: FUTURE_DATE,
          timeStart: '08:00',
          timeEnd: '09:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
        },
        tx,
      ),
    )

    const updated = await withTenantContext(tenant.id, (tx) =>
      completeBooking(created.id, 'admin', tx),
    )

    expect(updated.status).toBe('completed')
  })

  it('on pending_payment → BookingNotInConfirmedError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '12:00',
      timeEnd: '13:00',
    })

    await expect(
      withTenantContext(tenant.id, (tx) => completeBooking(bookingId, 'system', tx)),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)
  })
})

describe('markNoShow', () => {
  it('confirmed → no_show by admin', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const created = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: FUTURE_DATE,
          timeStart: '09:00',
          timeEnd: '10:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
        },
        tx,
      ),
    )

    const updated = await withTenantContext(tenant.id, (tx) =>
      markNoShow(created.id, staff.id, tx),
    )

    expect(updated.status).toBe('no_show')
  })
})

describe('expirePendingBooking', () => {
  it('pending_payment → expired (won=true)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '11:00',
      timeEnd: '12:00',
    })

    const result = await withTenantContext(tenant.id, (tx) =>
      expirePendingBooking(bookingId, tx),
    )
    expect(result.won).toBe(true)
    if (result.won) expect(result.row.status).toBe('expired')
  })

  it('not in pending_payment → won=false (no-op)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const created = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: FUTURE_DATE,
          timeStart: '13:00',
          timeEnd: '14:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
        },
        tx,
      ),
    )

    const result = await withTenantContext(tenant.id, (tx) =>
      expirePendingBooking(created.id, tx),
    )
    expect(result.won).toBe(false)
  })
})

describe('Race condition (Fix #9): only one worker wins', () => {
  it('two concurrent transitions on same pending_payment booking → exactly one won=true', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '15:00',
      timeEnd: '16:00',
    })

    let sideEffectCounter = 0

    // Simulate two concurrent workers: webhook handler vs expiry job.
    const db = getDb()
    const runner = async (newStatus: 'confirmed' | 'expired') => {
      return db.transaction(async (tx) => {
        await tx.execute(
          drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
        )
        const result = await transitionFromPendingPayment(bookingId, newStatus, tx)
        if (result.won) sideEffectCounter += 1
        return result
      })
    }

    const [a, b] = await Promise.all([runner('confirmed'), runner('expired')])

    const wins = [a, b].filter((r) => r.won === true).length
    expect(wins).toBe(1)
    expect(sideEffectCounter).toBe(1)
  })
})
