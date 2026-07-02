/**
 * Regression test: T1 audit/frontend-f07
 *
 * Asserts that `createDepositPayment` builds a notification URL that points at
 * the real MercadoPago webhook handler (`/api/webhooks/mercadopago?tenant=<id>`)
 * and NOT the nonexistent `/api/mp/webhooks` route that caused deposit bookings
 * to never be confirmed in production (webhooks 404'd).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import {
  closeSql,
  getSql,
  withPlayerContext,
} from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import type { CreatePreferenceInput } from '@/modules/payments/payment.types'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 1000000,
    },
  ],
}
const FUTURE = '2099-08-15'
const APP_URL = 'https://turnogol.app'

beforeAll(async () => {
  setExpiryScheduler(async () => {})
  await ensureRoles()
})

afterAll(async () => {
  setExpiryScheduler(null)
  await cleanupAll()
  await closeSql()
})

describe('createDepositPayment — notification URL', () => {
  it('sets notificationUrl to /api/webhooks/mercadopago (not /api/mp/webhooks)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    // Activate tenant with deposit enabled
    await sql`
      UPDATE tenants
      SET status = 'active',
          settings = jsonb_set(settings, '{requires_deposit}', 'true')
      WHERE id = ${tenant.id}
    `

    const player = await createTestPlayer(sql)

    const courtRows = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${tenant.id}, 'Test Court', 10, ${sql.json(PRICING)}, 'online')
      RETURNING id
    `
    const courtId = courtRows[0]!.id

    // Create a pending_payment booking with a deposit
    const booking = await withPlayerContext(player.id, async (tx) => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
      )
      return createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE,
          timeStart: '14:00',
          timeEnd: '15:00',
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      )
    })

    expect(booking.status).toBe('pending_payment')
    expect(booking.depositAmount).toBeGreaterThan(0)

    // Capturing gateway: records the CreatePreferenceInput it receives
    let capturedInput: CreatePreferenceInput | null = null
    const gateway = new MockGateway()
    const originalCreate = gateway.createPreference.bind(gateway)
    gateway.createPreference = async (input: CreatePreferenceInput) => {
      capturedInput = input
      return originalCreate(input)
    }

    await createDepositPayment(booking.id, gateway, tenant.id, APP_URL)

    // Primary assertion: notification URL must point at the real handler
    expect(capturedInput).not.toBeNull()
    const notifUrl = capturedInput!.notificationUrl
    expect(notifUrl).toMatch(
      new RegExp(`/api/webhooks/mercadopago\\?tenant=${tenant.id}$`),
    )

    // Negative: must NOT contain the nonexistent route
    expect(notifUrl).not.toContain('/api/mp/webhooks')

    // Sanity: correct tenant in the query param
    expect(notifUrl).toBe(
      `${APP_URL}/api/webhooks/mercadopago?tenant=${tenant.id}`,
    )
  })
})
