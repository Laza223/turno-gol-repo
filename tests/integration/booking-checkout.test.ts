import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, getSql, withPlayerContext, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { cleanupAll, createTestPlayer, createTestTenant, ensureRoles } from '../helpers/tenant'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'

const PRICING = { rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', price: 1000000 }] }
const FUTURE = '2099-07-20'

beforeAll(async () => { setExpiryScheduler(async () => {}); await ensureRoles() })
afterAll(async () => { setExpiryScheduler(null); await cleanupAll(); await closeSql() })

describe('booking + deposit checkout', () => {
  it('creates pending_payment booking then a deposit preference + pending payment row', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'active', settings = jsonb_set(settings, '{requires_deposit}', 'true') WHERE id = ${tenant.id}`
    const player = await createTestPlayer(sql)
    const courtRows = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${tenant.id}, 'C1', 10, ${sql.json(PRICING)}, 'online') RETURNING id
    `
    const courtId = courtRows[0]!.id

    const booking = await withPlayerContext(player.id, async (tx) => {
      await tx.execute(drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`)
      return createOnlineBooking(
        tenant.id,
        {
          playerId: player.id, courtId, date: FUTURE, timeStart: '10:00', timeEnd: '11:00',
          requiresDeposit: true, depositPercentage: 30,
        },
        tx,
      )
    })
    expect(booking.status).toBe('pending_payment')
    expect(booking.depositAmount).toBe(300000)

    const gateway = new MockGateway()
    const pref = await withTenantContext(tenant.id, (tx) =>
      createDepositPayment(booking.id, gateway, tx, 'http://localhost:3000'),
    )
    expect(pref.initPoint).toBeTruthy()

    const payRows = await sql<{ status: string; type: string }[]>`
      SELECT status, type FROM payments WHERE booking_id = ${booking.id}
    `
    expect(payRows[0]!.type).toBe('deposit')
    expect(payRows[0]!.status).toBe('pending')
  })
})
