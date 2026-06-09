import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeSql, getSql, withContext, withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

const FUTURE_DATE = '2031-06-02'
const PAST_DATE = '2020-06-01'

async function insertCourt(tenantId: string): Promise<string> {
  const db = getSql()
  const rows = await db<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Player Test'}, ${10},
      ${db.json({ rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 800000, '120': 1500000 } }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(params: {
  tenantId: string
  courtId: string
  playerId: string
  date: string
  timeStart: string
  timeEnd: string
}): Promise<string> {
  const db = getSql()
  const rows = await db<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      type, status, price_snapshot, deposit_amount, deposit_status
    ) VALUES (
      ${params.tenantId}, ${params.courtId}, ${params.playerId},
      ${params.date}::date, ${params.timeStart}::time, ${params.timeEnd}::time,
      'spontaneous', 'confirmed', ${800000}, 0, 'not_required'
    )
    RETURNING id
  `
  return rows[0]!.id
}

beforeAll(async () => {
  const db = getSql()
  await ensureRoles(db)
  await cleanupAll(db)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('player app — RLS isolation', () => {
  it('player A sees 2 bookings across 2 tenants, player B sees only 1', async () => {
    const db = getSql()
    const tenantA = await createTestTenant(db)
    const tenantB = await createTestTenant(db)
    const playerA = await createTestPlayer(db)
    const playerB = await createTestPlayer(db)

    const courtA = await insertCourt(tenantA.id)
    const courtB = await insertCourt(tenantB.id)

    await insertBooking({ tenantId: tenantA.id, courtId: courtA, playerId: playerA.id, date: FUTURE_DATE, timeStart: '10:00', timeEnd: '11:00' })
    await insertBooking({ tenantId: tenantB.id, courtId: courtB, playerId: playerA.id, date: FUTURE_DATE, timeStart: '12:00', timeEnd: '13:00' })
    await insertBooking({ tenantId: tenantA.id, courtId: courtA, playerId: playerB.id, date: FUTURE_DATE, timeStart: '14:00', timeEnd: '15:00' })

    const rowsA = await withContext(
      { role: 'authenticated', playerId: playerA.id },
      (tx) => tx`SELECT id FROM bookings`,
    )
    const rowsB = await withContext(
      { role: 'authenticated', playerId: playerB.id },
      (tx) => tx`SELECT id FROM bookings`,
    )

    expect((rowsA as unknown[]).length).toBe(2)
    expect((rowsB as unknown[]).length).toBe(1)
  })

  it('player B cannot read player A booking by id', async () => {
    const db = getSql()
    const tenant = await createTestTenant(db)
    const playerA = await createTestPlayer(db)
    const playerB = await createTestPlayer(db)
    const court = await insertCourt(tenant.id)

    const bookingId = await insertBooking({
      tenantId: tenant.id, courtId: court, playerId: playerA.id,
      date: FUTURE_DATE, timeStart: '16:00', timeEnd: '17:00',
    })

    const rows = await withContext(
      { role: 'authenticated', playerId: playerB.id },
      (tx) => tx`SELECT id FROM bookings WHERE id = ${bookingId}`,
    )

    expect((rows as unknown[]).length).toBe(0)
  })
})

describe('player app — upcoming vs history', () => {
  it('date filter separates upcoming from past under player context', async () => {
    const db = getSql()
    const tenant = await createTestTenant(db)
    const player = await createTestPlayer(db)
    const court = await insertCourt(tenant.id)

    await insertBooking({ tenantId: tenant.id, courtId: court, playerId: player.id, date: FUTURE_DATE, timeStart: '10:00', timeEnd: '11:00' })
    await insertBooking({ tenantId: tenant.id, courtId: court, playerId: player.id, date: PAST_DATE, timeStart: '10:00', timeEnd: '11:00' })

    const upcoming = await withContext(
      { role: 'authenticated', playerId: player.id },
      (tx) => tx`SELECT id FROM bookings WHERE date >= NOW()::date`,
    )
    const history = await withContext(
      { role: 'authenticated', playerId: player.id },
      (tx) => tx`SELECT id FROM bookings WHERE date < NOW()::date`,
    )

    expect((upcoming as unknown[]).length).toBe(1)
    expect((history as unknown[]).length).toBe(1)
  })
})

describe('player app — profile update', () => {
  it('updates player name via withPlayerContext', async () => {
    const db = getSql()
    const player = await createTestPlayer(db)

    await withPlayerContext(player.id, (tx) =>
      tx
        .update(players)
        .set({ firstName: 'Actualizado' })
        .where(eq(players.id, player.id)),
    )

    const rows = await db<{ first_name: string }[]>`
      SELECT first_name FROM players WHERE id = ${player.id}
    `
    expect(rows[0]!.first_name).toBe('Actualizado')
  })
})
