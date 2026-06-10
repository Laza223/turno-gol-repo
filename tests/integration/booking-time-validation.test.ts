import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  completeBooking,
  createManualBooking,
  createOnlineBooking,
  markNoShow,
} from '@/modules/bookings/booking.service'
import { BookingDateOutOfRangeError } from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
}, 30_000)

afterAll(async () => closeSql())

describe('booking time validation: completeBooking / markNoShow', () => {
  it('completeBooking on future booking → MUST reject (currently allows: bug)', async () => {
    const futureDate = '2099-01-01'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: futureDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('confirmed')

    // BUG EXPECTED: this should reject because time_end is in the year 2099.
    // Currently completeBooking has no time check — only autoCompleteOverdueBookings does.
    await expect(
      withTenantContext(tenant.id, (tx) => completeBooking(booking.id, 'admin', tx)),
    ).rejects.toThrow(/before|future|not yet|ended|finalized|time/i)
  }, 30_000)

  it('markNoShow on future booking → MUST reject (currently allows: bug)', async () => {
    const futureDate = '2099-01-02'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: futureDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('confirmed')

    // BUG EXPECTED: should reject because slot hasn't started yet.
    await expect(
      withTenantContext(tenant.id, (tx) => markNoShow(booking.id, seed.staffUserId, tx)),
    ).rejects.toThrow(/before|future|not yet|ended|started|time/i)
  }, 30_000)

  it('completeBooking on past booking → allows (sanity check)', async () => {
    const pastDate = '2020-01-01'
    const booking = await withTenantContext(tenant.id, (tx) =>
      createManualBooking(
        tenant.id,
        {
          courtId: seed.courtId,
          date: pastDate,
          timeStart: '20:00',
          timeEnd: '21:00',
          durationMins: 60,
          type: 'spontaneous',
          staffUserId: seed.staffUserId,
          playerId,
        },
        tx,
      ),
    )

    const completed = await withTenantContext(tenant.id, (tx) =>
      completeBooking(booking.id, 'admin', tx),
    )
    expect(completed.status).toBe('completed')
  }, 30_000)
})

// ─── createOnlineBooking: date window validation (BK-04) ───────────────────
// All tests below use any UUIDs for courtId/playerId for the "reject" cases
// because the date check runs BEFORE any DB call — no real court/player needed.

function artNow(): Date {
  return new Date(Date.now() - 3 * 3600_000)
}
function artTodayStr(): string {
  return artNow().toISOString().slice(0, 10)
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const FAKE_COURT = '00000000-0000-0000-0000-000000000001'
const FAKE_PLAYER = '00000000-0000-0000-0000-000000000002'

describe('createOnlineBooking: date window validation (BK-04)', () => {
  it('rejects a date in the past (yesterday)', async () => {
    const yesterday = addDaysStr(artTodayStr(), -1)
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: FAKE_PLAYER,
            courtId: FAKE_COURT,
            date: yesterday,
            timeStart: '10:00',
            timeEnd: '11:00',
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
            maxAdvanceDays: 6,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
  }, 10_000)

  it('rejects today slot whose start time has already passed in ART', async () => {
    const now = artNow()
    // Only run if it's past the first hour of the day in ART
    if (now.getUTCHours() < 1) return
    const today = artTodayStr()
    const pastHour = now.getUTCHours() - 1
    const timeStart = `${String(pastHour).padStart(2, '0')}:00`
    const timeEnd = `${String(pastHour + 1).padStart(2, '0')}:00`

    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: FAKE_PLAYER,
            courtId: FAKE_COURT,
            date: today,
            timeStart,
            timeEnd,
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
            maxAdvanceDays: 6,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
  }, 10_000)

  it('rejects a date beyond the maxAdvanceDays window', async () => {
    const beyondWindow = addDaysStr(artTodayStr(), 7) // 7 > maxAdvanceDays(6)
    await expect(
      withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: FAKE_PLAYER,
            courtId: FAKE_COURT,
            date: beyondWindow,
            timeStart: '10:00',
            timeEnd: '11:00',
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
            maxAdvanceDays: 6,
          },
          tx,
        ),
      ),
    ).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
  }, 10_000)

  it('allows a valid date within the advance window (booking is created)', async () => {
    const tomorrow = addDaysStr(artTodayStr(), 1)
    const result = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: playerId,
          courtId: seed.courtId,
          date: tomorrow,
          timeStart: '10:00',
          timeEnd: '11:00',
          durationMins: 60,
          requiresDeposit: false,
          depositPercentage: 0,
          maxAdvanceDays: 6,
        },
        tx,
      ),
    )
    expect(result.status).toBe('confirmed')
  }, 10_000)
})
