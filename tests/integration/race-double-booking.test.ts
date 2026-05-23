import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
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

describe('race: double booking (manual vs online, same court/slot)', () => {
  it('N=10 concurrent attempts → exactly 1 succeeds, rest reject', async () => {
    const date = '2026-06-15'
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const N = 10
    const attempts: Promise<'won' | 'lost'>[] = []
    for (let i = 0; i < N; i++) {
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
    }
    const results = await Promise.all(attempts)
    const winners = results.filter((r) => r === 'won').length
    expect(winners).toBe(1)
    expect(results.filter((r) => r === 'lost').length).toBe(N - 1)

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
