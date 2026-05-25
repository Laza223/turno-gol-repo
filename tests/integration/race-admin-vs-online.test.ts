import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking, createOnlineBooking } from '@/modules/bookings/booking.service'
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

afterAll(async () => {
  await closeSql()
})

describe('race: admin manual booking vs player online booking (same court/slot)', () => {
  it('admin createManualBooking + online createOnlineBooking concurrent → exactly 1 wins', async () => {
    const date = '2026-07-15'
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const adminAttempt = withTenantContext(tenant.id, async (tx) => {
      try {
        await createManualBooking(
          tenant.id,
          {
            courtId: seed.courtId,
            date,
            timeStart,
            timeEnd,
            durationMins: 60,
            type: 'spontaneous',
            staffUserId: seed.staffUserId,
            playerId,
          },
          tx,
        )
        return 'admin_won' as const
      } catch {
        return 'admin_lost' as const
      }
    })

    const onlineAttempt = withTenantContext(tenant.id, async (tx) => {
      try {
        await createOnlineBooking(
          tenant.id,
          {
            playerId,
            courtId: seed.courtId,
            date,
            timeStart,
            timeEnd,
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        )
        return 'online_won' as const
      } catch {
        return 'online_lost' as const
      }
    })

    const results = await Promise.all([adminAttempt, onlineAttempt])
    const wins = results.filter((r) => r.endsWith('_won')).length
    expect(wins).toBe(1)

    const sql = getSql()
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM bookings
      WHERE court_id = ${seed.courtId}
        AND date = ${date}::date
        AND time_start = ${timeStart}::time
        AND status IN ('pending_payment', 'confirmed')
    `
    expect(rows[0].c).toBe(1)
  }, 30_000)

  it('N=10 mix (5 admin + 5 online) concurrent on same slot → exactly 1 wins', async () => {
    const date = '2026-07-16'
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const attempts: Promise<'won' | 'lost'>[] = []
    for (let i = 0; i < 5; i++) {
      attempts.push(
        withTenantContext(tenant.id, async (tx) => {
          try {
            await createManualBooking(
              tenant.id,
              {
                courtId: seed.courtId,
                date,
                timeStart,
                timeEnd,
                durationMins: 60,
                type: 'spontaneous',
                staffUserId: seed.staffUserId,
                playerId,
              },
              tx,
            )
            return 'won' as const
          } catch {
            return 'lost' as const
          }
        }),
      )
      attempts.push(
        withTenantContext(tenant.id, async (tx) => {
          try {
            await createOnlineBooking(
              tenant.id,
              {
                playerId,
                courtId: seed.courtId,
                date,
                timeStart,
                timeEnd,
                durationMins: 60,
                requiresDeposit: false,
                depositPercentage: 0,
              },
              tx,
            )
            return 'won' as const
          } catch {
            return 'lost' as const
          }
        }),
      )
    }
    const results = await Promise.all(attempts)
    const winners = results.filter((r) => r === 'won').length
    expect(winners).toBe(1)

    const sql = getSql()
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM bookings
      WHERE court_id = ${seed.courtId}
        AND date = ${date}::date
        AND time_start = ${timeStart}::time
        AND status IN ('pending_payment', 'confirmed')
    `
    expect(rows[0].c).toBe(1)
  }, 30_000)
})
