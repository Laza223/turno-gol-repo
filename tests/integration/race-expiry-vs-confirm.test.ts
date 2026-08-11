import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { insertBooking } from '../helpers/factories'

let tenant: { id: string }
let seed: IsolationSeed
let bookingId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: player.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: 100000,
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('race: expiry vs confirm (same pending_payment row)', () => {
  it('exactly one transitions; loser sees won=false', async () => {
    const [a, b] = await Promise.all([
      withTenantContext(tenant.id, (tx) =>
        transitionFromPendingPayment(bookingId, 'confirmed', tx),
      ),
      withTenantContext(tenant.id, (tx) => transitionFromPendingPayment(bookingId, 'expired', tx)),
    ])

    const winners = [a, b].filter((r) => r.won).length
    expect(winners).toBe(1)

    const sql = getSql()
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(['confirmed', 'expired']).toContain(rows[0].status)
  }, 30_000)
})
