import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { PlayerBannedError } from '@/modules/bookings/booking.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 800000, '120': 1500000 },
    },
  ],
}

const FUTURE_DATE = '2031-06-02'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Bans Test'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertActiveBan(params: {
  tenantId: string
  playerId: string
  reason: string
  bannedUntil?: string | null
}): Promise<void> {
  const sql = getSql()
  if (params.bannedUntil) {
    await sql`
      INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_until)
      VALUES (${params.tenantId}, ${params.playerId}, ${params.reason}, ${params.bannedUntil}::timestamptz)
    `
  } else {
    await sql`
      INSERT INTO tenant_player_bans (tenant_id, player_id, reason)
      VALUES (${params.tenantId}, ${params.playerId}, ${params.reason})
    `
  }
}

async function setPlayerBannedGlobally(playerId: string): Promise<void> {
  const sql = getSql()
  await sql`UPDATE players SET status = 'banned' WHERE id = ${playerId}`
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('ban service — createOnlineBooking integration', () => {
  it('active per-tenant ban → PlayerBannedError (bannedGlobal=false)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    await insertActiveBan({
      tenantId: tenant.id,
      playerId: player.id,
      reason: 'Mal comportamiento',
      bannedUntil: null,
    })

    let caught: unknown = null
    try {
      await withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: player.id,
            courtId,
            date: FUTURE_DATE,
            timeStart: '10:00',
            timeEnd: '11:00',
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        ),
      )
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(PlayerBannedError)
    const err = caught as PlayerBannedError
    expect(err.bannedGlobal).toBe(false)
    expect(err.reason).toBe('Mal comportamiento')
  })

  it('expired per-tenant ban → booking succeeds', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    await insertActiveBan({
      tenantId: tenant.id,
      playerId: player.id,
      reason: 'Ban expirado',
      bannedUntil: '2020-01-01T00:00:00Z',
    })

    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '12:00',
          timeEnd: '13:00',
          durationMins: 60,
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      ),
    )

    expect(booking.status).toBe('confirmed')
  })

  it('global ban (players.status=banned) → PlayerBannedError (bannedGlobal=true)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)

    await setPlayerBannedGlobally(player.id)

    let caught: unknown = null
    try {
      await withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: player.id,
            courtId,
            date: FUTURE_DATE,
            timeStart: '14:00',
            timeEnd: '15:00',
            durationMins: 60,
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        ),
      )
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(PlayerBannedError)
    const err = caught as PlayerBannedError
    expect(err.bannedGlobal).toBe(true)
  })
})
