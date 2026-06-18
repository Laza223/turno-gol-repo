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
  NoShowCorrectionWindowExpiredError,
  PlayerBannedError,
  PlayerHasOutstandingBalanceError,
  SlotTakenError,
} from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import { sql as drizzleSql } from 'drizzle-orm'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'

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

// Inserts a booking already in 'completed' with a backdated updated_at. Raw
// INSERT is NOT subject to enforce_booking_invariants (UPDATE-only) nor to
// set_updated_at (BEFORE UPDATE only), so updated_at stays where we put it —
// the only way to simulate a booking completed N hours ago without a real clock.
async function insertCompletedBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  date: string
  timeStart: string
  timeEnd: string
  agedHours: number
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status, updated_at
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${800000}, ${0}, 'not_required', NULL, 'completed',
      NOW() - (${opts.agedHours} || ' hours')::interval
    )
    RETURNING id
  `
  return rows[0]!.id
}

const FUTURE_DATE = '2027-04-26' // Monday, far in the future
const PAST_DATE = '2020-04-27' // Monday, far in the past (used by completeBooking/markNoShow tests)

// Capturing stub for the expiry-timer seam. The previous silent `() => {}`
// no-op meant a regression that drops `scheduleBookingExpiry()` (Hallazgo 1 —
// the pending_payment TTL) would never be caught: the deposit booking would
// stay pending forever and lock the slot, yet the test stayed green. We now
// record every armed timer so tests can assert the side effect.
const armedExpiries: Array<{ bookingId: string; startAfter: number }> = []

beforeAll(async () => {
  setExpiryScheduler(async (bookingId, startAfter) => {
    armedExpiries.push({ bookingId, startAfter })
  })
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  setExpiryScheduler(null)
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

    armedExpiries.length = 0
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
    // A confirmed booking is final: it must NOT arm an expiry timer, or the
    // 15-min sweep would later expire an already-paid/no-deposit reservation.
    expect(armedExpiries).toHaveLength(0)
  })

  it('requiresDeposit=true → pending_payment with deposit_amount calculated', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    armedExpiries.length = 0
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
    // Hallazgo 1: a pending_payment booking MUST arm the TTL expiry timer for
    // exactly this booking, with a positive delay (otherwise the slot would be
    // locked forever when the player abandons the MP checkout).
    expect(armedExpiries).toEqual([
      expect.objectContaining({ bookingId: booking.id }),
    ])
    expect(armedExpiries[0]!.startAfter).toBeGreaterThan(0)
  })
})

describe('transitionFromPendingPayment → confirmed (doc7 Flujo 2 PASO 5)', () => {
  it('confirma la reserva y marca la seña como pagada (deposit_status=paid)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    // Real pending_payment booking with a deposit (as the MP checkout flow leaves it).
    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '08:00',
          timeEnd: '09:00',
          durationMins: 60,
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('pending_payment')
    expect(booking.depositStatus).toBe('pending')
    expect(booking.depositAmount).toBe(240000)

    // Simulate the MP "approved" webhook winning the race.
    const result = await withTenantContext(tenant.id, (tx) =>
      transitionFromPendingPayment(booking.id, 'confirmed', tx),
    )

    expect(result.won).toBe(true)
    if (result.won) {
      expect(result.row.status).toBe('confirmed')
      // The deposit must flip to 'paid' atomically with the confirmation;
      // otherwise the seña stays 'pending' forever despite an approved payment.
      expect(result.row.depositStatus).toBe('paid')
      expect(result.row.depositAmount).toBe(240000)
    }

    // And the change is durable in the row, not just in the returned object.
    const persisted = await sql<{ status: string; deposit_status: string }[]>`
      SELECT status, deposit_status FROM bookings WHERE id = ${booking.id}
    `
    expect(persisted[0]).toEqual({ status: 'confirmed', deposit_status: 'paid' })
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

    // The trigger must have ROLLED BACK the write, not merely raised on something
    // unrelated: the snapshot stays at its original captured value.
    const after = await sql<{ price_snapshot: number }[]>`
      SELECT price_snapshot FROM bookings WHERE id = ${bookingId}
    `
    expect(after[0]!.price_snapshot).toBe(800000)
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

  it('UPDATE on completed booking is rejected by trigger (incl. status→no_show)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    // PAST_DATE so the booking can be legitimately completed (B1: time_end passed).
    const created = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: PAST_DATE,
          timeStart: '08:00',
          timeEnd: '09:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
        },
        tx,
      ),
    )
    const completed = await withTenantContext(tenant.id, (tx) =>
      completeBooking(created.id, 'admin', tx),
    )
    expect(completed.status).toBe('completed')

    // A non-correction field UPDATE on a 'completed' row is still rejected by the
    // trigger: only the completed→no_show status change is exempted (see the
    // '24h correction' describe below).
    await expect(
      sql`UPDATE bookings SET notes_internal = 'foo' WHERE id = ${created.id}`,
    ).rejects.toThrow(/terminal/i)
  })

  it('UPDATE on no_show booking is rejected by trigger', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    // PAST_DATE so the slot is past-due for no-show marking (B1: time_start passed).
    const created = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: PAST_DATE,
          timeStart: '08:00',
          timeEnd: '09:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
        },
        tx,
      ),
    )
    const marked = await withTenantContext(tenant.id, (tx) =>
      markNoShow(created.id, staff.id, tx),
    )
    expect(marked.status).toBe('no_show')

    await expect(
      sql`UPDATE bookings SET notes_internal = 'foo' WHERE id = ${created.id}`,
    ).rejects.toThrow(/terminal/i)
  })
})

describe('completed → no_show: corrección de 24h (P5)', () => {
  it('un admin corrige completed → no_show dentro de las 24h', async () => {
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
          date: PAST_DATE,
          timeStart: '08:00',
          timeEnd: '09:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: staff.id,
        },
        tx,
      ),
    )
    // completeBooking sets updated_at = NOW(), so we are inside the 24h window.
    await withTenantContext(tenant.id, (tx) =>
      completeBooking(created.id, 'admin', tx),
    )

    const corrected = await withTenantContext(tenant.id, (tx) =>
      markNoShow(created.id, staff.id, tx),
    )
    expect(corrected.status).toBe('no_show')

    const after = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${created.id}
    `
    expect(after[0]!.status).toBe('no_show')
  })

  it('rechaza la corrección pasadas las 24h (NoShowCorrectionWindowExpiredError)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertCompletedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: PAST_DATE,
      timeStart: '08:00',
      timeEnd: '09:00',
      agedHours: 25,
    })

    await expect(
      withTenantContext(tenant.id, (tx) => markNoShow(bookingId, staff.id, tx)),
    ).rejects.toBeInstanceOf(NoShowCorrectionWindowExpiredError)

    // El turno sigue 'completed' (la corrección no se aplicó).
    const after = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(after[0]!.status).toBe('completed')
  })

  it('el trigger DB permite el raw UPDATE dentro de 24h y lo bloquea pasadas', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    // Dentro de la ventana: el trigger lo permite.
    const fresh = await insertCompletedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: PAST_DATE,
      timeStart: '08:00',
      timeEnd: '09:00',
      agedHours: 1,
    })
    await sql`UPDATE bookings SET status = 'no_show' WHERE id = ${fresh}`
    const a = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${fresh}
    `
    expect(a[0]!.status).toBe('no_show')

    // Pasada la ventana: el trigger lo bloquea (backstop de defensa en profundidad).
    const stale = await insertCompletedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: PAST_DATE,
      timeStart: '10:00',
      timeEnd: '11:00',
      agedHours: 25,
    })
    await expect(
      sql`UPDATE bookings SET status = 'no_show' WHERE id = ${stale}`,
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

    // B1 audit: completeBooking now requires time_end to have passed for admin actor.
    // Using PAST_DATE so the booking can be legitimately completed.
    const created = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: PAST_DATE,
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

    // 'completed' is terminal: completing it again must fail (the row is no
    // longer in 'confirmed'), proving the transition really moved state rather
    // than just echoing 'completed' back.
    await expect(
      withTenantContext(tenant.id, (tx) => completeBooking(created.id, 'admin', tx)),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)
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

    // B1 audit: markNoShow now requires time_start to have passed.
    // Using PAST_DATE so the slot is legitimately past-due for no-show marking.
    const created = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId,
          date: PAST_DATE,
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

    // 'no_show' is terminal: re-marking must fail (row no longer 'confirmed').
    await expect(
      withTenantContext(tenant.id, (tx) => markNoShow(created.id, staff.id, tx)),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)
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

// ─── GAP: guard de saldo deudor contra DB real ──────────────────────────────
// El único test previo (tests/unit/booking-balance-guard.test.ts) MOCKEA
// getPlayerBlockState por completo, así que nunca toca la columna real
// player_tenant_relationships.balance (migración 022). Si esa columna no
// existiera o el SELECT se rompiera, el unit seguiría verde. Acá lo ejercemos
// end-to-end contra la DB.
describe('createOnlineBooking — guard de saldo deudor (DB real)', () => {
  it('rechaza la reserva cuando el jugador tiene balance > 0 en el complejo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`
      UPDATE player_tenant_relationships
      SET balance = ${250000}
      WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}
    `

    const err = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '08:00',
          timeEnd: '09:00',
          durationMins: 60,
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(PlayerHasOutstandingBalanceError)
    expect((err as PlayerHasOutstandingBalanceError).balance).toBe(250000)

    // Y no se creó ninguna reserva pese a la deuda.
    const count = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings WHERE court_id = ${courtId}
    `
    expect(count[0]!.n).toBe(0)
  })

  it('rechaza la reserva cuando la relación está marcada como blocked', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`
      UPDATE player_tenant_relationships
      SET status = 'blocked'
      WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}
    `

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: player.id,
            courtId,
            date: FUTURE_DATE,
            timeStart: '09:00',
            timeEnd: '10:00',
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(PlayerHasOutstandingBalanceError)
  })

  it('permite reservar cuando el jugador está al día (balance=0, active)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await linkPlayerToTenant(sql, tenant.id, player.id) // balance=0, status='active' por default

    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
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
      ),
    )
    expect(booking.status).toBe('confirmed')
  })
})

// ─── GAP: guard de ban contra DB real ───────────────────────────────────────
// checkPlayerBanned está mockeado en el unit; acá verificamos el cableado real:
// un jugador con ban global (players.status='banned') no puede reservar online.
describe('createOnlineBooking — guard de ban (DB real)', () => {
  it('rechaza la reserva cuando el jugador tiene ban global', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await sql`UPDATE players SET status = 'banned' WHERE id = ${player.id}`

    const err = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '11:00',
          timeEnd: '12:00',
          durationMins: 60,
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(PlayerBannedError)
    expect((err as PlayerBannedError).bannedGlobal).toBe(true)
  })
})

// ─── GAP: aislamiento de tenant en la cancha (defensa en profundidad / IDOR) ──
// lockCourtOrThrow valida court.tenantId === tenantId además de RLS. Sin este
// chequeo, un admin podría reservar contra una cancha de OTRO complejo.
describe('aislamiento de tenant en la cancha', () => {
  it('createManualBooking con cancha de otro tenant → CourtOfflineError', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, staffA.id)
    const courtB = await insertCourt(tenantB.id) // cancha pertenece a B

    await expect(
      withTenantContext(tenantA.id, (tx) =>
        createManualBooking(
          tenantA.id,
          {
            courtId: courtB,
            date: FUTURE_DATE,
            timeStart: '12:00',
            timeEnd: '13:00',
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: staffA.id,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(CourtOfflineError)

    // No se filtró ninguna reserva a la cancha del otro complejo.
    const count = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings WHERE court_id = ${courtB}
    `
    expect(count[0]!.n).toBe(0)
  })
})

// ─── GAP: type='block' fuerza precio 0 ───────────────────────────────────────
describe('createManualBooking — type=block', () => {
  it('un bloqueo de cancha se confirma con price_snapshot=0 (sin cobro)', async () => {
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
          timeStart: '21:00',
          timeEnd: '22:00',
          durationMins: 60,
          type: 'block',
          staffUserId: staff.id,
          notesInternal: 'Mantenimiento',
        },
        tx,
      ),
    )

    // El pricing de la cancha cobraría 800000, pero un bloqueo nunca cobra.
    expect(booking.priceSnapshot).toBe(0)
    expect(booking.status).toBe('confirmed')
    expect(booking.type).toBe('block')
  })
})
