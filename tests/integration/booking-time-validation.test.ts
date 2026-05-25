import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  completeBooking,
  createManualBooking,
  markNoShow,
} from '@/modules/bookings/booking.service'
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
