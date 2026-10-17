import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { physicalRange } from '@/shared/time/physical-range'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

/**
 * `deposit_expired` y `player_late_payment_refunded` (los dos mails al jugador que salen de un
 * worker, no de una acción) dicen el día calendario en que se juega, de `starts_at`. Con
 * `closes_next_day`, el turno de 00:00 del día operativo D se juega el D+1. Control negativo: el
 * turno de 20:00 dice D.
 */

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-oauth', async () => {
  const actual = await vi.importActual<typeof import('@/modules/payments/mp-oauth')>(
    '@/modules/payments/mp-oauth',
  )
  return { ...actual, resolveTenantGateway: () => mockGateway }
})

vi.mock('@/modules/notifications/notification.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/modules/notifications/notification.service')
  >('@/modules/notifications/notification.service')
  return { ...actual, dispatchEmail: async () => {} }
})

import { expirePendingBookingWithPolicy } from '@/modules/bookings/booking.expiry'
import { reconcilePendingPayments } from '@/shared/jobs/workers/reconcile-pending-payments.worker'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '00:00',
      to: '23:00',
      price: 800000,
    },
  ],
}
const DEPOSIT = 240000
const D = addDays(artTodayStr(), 3)
const ddmmyyyy = (iso: string): string => iso.split('-').reverse().join('/')

async function setup(timeStart: string, timeEnd: string, status: 'pending_payment' | 'expired') {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  await sql`
    UPDATE tenants SET closes_next_day = true, mp_access_token = ${'dummy-encrypted-token'}
    WHERE id = ${tenant.id}
  `
  const [{ id: courtId }] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, ${'Cancha Madrugada'}, 10, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  const { startsAt, endsAt } = physicalRange({
    date: D,
    timeStart,
    timeEnd,
    physicallyNextDay: timeStart < '08:00',
  })
  const [{ id: bookingId }] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status,
      created_at, updated_at
    ) VALUES (
      ${tenant.id}, ${courtId}, ${player.id}, ${D}::date, ${timeStart}::time, ${timeEnd}::time,
      ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
      800000, ${DEPOSIT}, 'pending', NULL, ${status}::booking_status,
      NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '14 minutes'
    )
    RETURNING id
  `
  return { tenantId: tenant.id, bookingId, playerId: player.id, courtId }
}

async function mailContent(playerId: string, template: string) {
  const sql = getSql()
  const rows = await sql<{ content: { date: string; timeStart: string } }[]>`
    SELECT content FROM notifications
    WHERE recipient_id = ${playerId} AND template_name = ${template}
  `
  return rows[0]!.content
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(() => {
  mockGateway.searchResults = {}
})

afterAll(async () => closeSql())

describe('deposit_expired — día físico', () => {
  it('turno de 00:00 de closes_next_day → D+1', async () => {
    const { bookingId, playerId } = await setup('00:00', '01:00', 'pending_payment')
    expect(await expirePendingBookingWithPolicy(bookingId)).toBe('expired')
    expect((await mailContent(playerId, 'deposit_expired')).date).toBe(ddmmyyyy(addDays(D, 1)))
  })

  it('control negativo: turno de 20:00 → D', async () => {
    const { bookingId, playerId } = await setup('20:00', '21:00', 'pending_payment')
    expect(await expirePendingBookingWithPolicy(bookingId)).toBe('expired')
    expect((await mailContent(playerId, 'deposit_expired')).date).toBe(ddmmyyyy(D))
  })
})

describe('player_late_payment_refunded — día físico', () => {
  async function lateMail(timeStart: string, timeEnd: string) {
    const { tenantId, bookingId, playerId } = await setup(timeStart, timeEnd, 'expired')
    const sql = getSql()
    await sql`
      INSERT INTO payments (tenant_id, booking_id, player_id, amount, type, method, status, mp_preference_id)
      VALUES (${tenantId}, ${bookingId}, ${playerId}, ${DEPOSIT}, 'deposit', 'mercadopago',
              'pending', ${'pref-' + bookingId})
    `
    mockGateway.searchResults[bookingId] = [
      {
        mpPaymentId: `mp-late-${bookingId.slice(0, 8)}`,
        status: 'approved',
        amount: DEPOSIT,
        externalReference: bookingId,
        paymentMethodId: 'account_money',
      },
    ]
    expect(await reconcilePendingPayments()).toBe(1)
    return mailContent(playerId, 'player_late_payment_refunded')
  }

  it('turno de 00:00 de closes_next_day → D+1', async () => {
    expect((await lateMail('00:00', '01:00')).date).toBe(ddmmyyyy(addDays(D, 1)))
  }, 30_000)

  it('control negativo: turno de 20:00 → D', async () => {
    expect((await lateMail('20:00', '21:00')).date).toBe(ddmmyyyy(D))
  }, 30_000)
})
