import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { TooManyActiveHoldsError } from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { MAX_ACTIVE_HOLDS_PER_PLAYER } from '@/shared/constants'

const FUTURE_DATE = '2027-05-10' // Monday, far in the future

const PRICING = {
  rules: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 },
  ],
}

async function insertCourt(tenantId: string, name: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${name}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertPendingHold(opts: {
  tenantId: string
  courtId: string
  playerId: string
  timeStart: string
  timeEnd: string
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${FUTURE_DATE}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${800000}, ${240000}, 'pending', NULL, 'pending_payment'
    )
    RETURNING id
  `
  return rows[0]!.id
}

beforeAll(async () => {
  setExpiryScheduler(async () => {})
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  setExpiryScheduler(null)
  await closeSql()
})

describe('createOnlineBooking — tope de holds activos (INV-ABUSE-001)', () => {
  it(`rechaza el hold ${MAX_ACTIVE_HOLDS_PER_PLAYER + 1} cuando ya hay ${MAX_ACTIVE_HOLDS_PER_PLAYER} pending_payment en el mismo tenant`, async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const holdCourt = await insertCourt(tenant.id, 'Cancha Holds')
    for (let i = 0; i < MAX_ACTIVE_HOLDS_PER_PLAYER; i++) {
      const h = String(8 + i).padStart(2, '0')
      const hNext = String(9 + i).padStart(2, '0')
      await insertPendingHold({
        tenantId: tenant.id,
        courtId: holdCourt,
        playerId: player.id,
        timeStart: `${h}:00`,
        timeEnd: `${hNext}:00`,
      })
    }

    const newCourt = await insertCourt(tenant.id, 'Cancha Nueva')
    const err = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId: newCourt,
          date: FUTURE_DATE,
          timeStart: '20:00',
          timeEnd: '21:00',
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(TooManyActiveHoldsError)
    expect((err as TooManyActiveHoldsError).activeCount).toBe(MAX_ACTIVE_HOLDS_PER_PLAYER)

    const count = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings WHERE court_id = ${newCourt}
    `
    expect(count[0]!.n).toBe(0)
  })

  it(`permite el hold cuando hay menos de ${MAX_ACTIVE_HOLDS_PER_PLAYER} pending_payment`, async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const holdCourt = await insertCourt(tenant.id, 'Cancha Holds')
    for (let i = 0; i < MAX_ACTIVE_HOLDS_PER_PLAYER - 1; i++) {
      const h = String(8 + i).padStart(2, '0')
      const hNext = String(9 + i).padStart(2, '0')
      await insertPendingHold({
        tenantId: tenant.id,
        courtId: holdCourt,
        playerId: player.id,
        timeStart: `${h}:00`,
        timeEnd: `${hNext}:00`,
      })
    }

    const newCourt = await insertCourt(tenant.id, 'Cancha Nueva')
    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId: newCourt,
          date: FUTURE_DATE,
          timeStart: '20:00',
          timeEnd: '21:00',
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('pending_payment')
  })

  it('holds en OTRO tenant no cuentan para el tope', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtA = await insertCourt(tenantA.id, 'Cancha A')
    for (let i = 0; i < MAX_ACTIVE_HOLDS_PER_PLAYER; i++) {
      const h = String(8 + i).padStart(2, '0')
      const hNext = String(9 + i).padStart(2, '0')
      await insertPendingHold({
        tenantId: tenantA.id,
        courtId: courtA,
        playerId: player.id,
        timeStart: `${h}:00`,
        timeEnd: `${hNext}:00`,
      })
    }

    const courtB = await insertCourt(tenantB.id, 'Cancha B')
    const booking = await withTenantContext(tenantB.id, (tx) =>
      createOnlineBooking(
        tenantB.id,
        {
          playerId: player.id,
          courtId: courtB,
          date: FUTURE_DATE,
          timeStart: '20:00',
          timeEnd: '21:00',
          requiresDeposit: true,
          depositPercentage: 30,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('pending_payment')
  })
})
