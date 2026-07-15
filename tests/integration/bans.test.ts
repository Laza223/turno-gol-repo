import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { PlayerBannedError } from '@/modules/bookings/booking.errors'
import { banPlayerManually, checkPlayerBanned, liftPlayerBan } from '@/modules/bans/ban.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
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

// R3-6: los tests de arriba cubren createOnlineBooking contra bans
// PREEXISTENTES (insertados por SQL). El ciclo manual real
// (banPlayerManually/liftPlayerBan, doc7 Flujo 5B) tenía cobertura unit con
// un tx fake en memoria (tests/unit/ban-manual.test.ts) pero nada contra
// Postgres real bajo RLS — acá se ejercita el service tal cual lo llaman las
// Server Actions de /jugadores (withTenantContext real, trigger
// enforce_single_active_ban real).
describe('banPlayerManually / liftPlayerBan — ciclo manual end-to-end bajo RLS', () => {
  it('crea la fila en tenant_player_bans y bloquea createOnlineBooking (bannedGlobal=false)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    const courtId = await insertCourt(tenant.id)

    await withTenantContext(tenant.id, (tx) =>
      banPlayerManually(tenant.id, player.id, staff.id, 'Rotura de vidrios', null, tx),
    )

    const rows = await sql<{ c: string }[]>`
      SELECT COUNT(*)::text AS c FROM tenant_player_bans
      WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}
    `
    expect(Number(rows[0]!.c)).toBe(1)

    const checked = await withTenantContext(tenant.id, (tx) => checkPlayerBanned(player.id, tenant.id, tx))
    expect(checked.banned).toBe(true)
    if (checked.banned) {
      expect(checked.bannedGlobal).toBe(false)
      expect(checked.reason).toBe('Rotura de vidrios')
    }

    let caught: unknown = null
    try {
      await withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: player.id,
            courtId,
            date: FUTURE_DATE,
            timeStart: '16:00',
            timeEnd: '17:00',
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
    expect((caught as PlayerBannedError).bannedGlobal).toBe(false)
  })

  it('un segundo ban manual sobre un ban vigente actualiza la fila existente, no duplica', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)

    await withTenantContext(tenant.id, (tx) =>
      banPlayerManually(tenant.id, player.id, staff.id, 'Primer motivo', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), tx),
    )
    await withTenantContext(tenant.id, (tx) =>
      banPlayerManually(tenant.id, player.id, staff.id, 'Segundo motivo', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), tx),
    )

    // El trigger enforce_single_active_ban (migración 005) ya rechazaría un
    // 2do INSERT vigente; acá se confirma además que banPlayerManually ni
    // siquiera lo intenta — solo hay UNA fila física para este jugador/tenant.
    const rows = await sql<{ c: string; reason: string }[]>`
      SELECT COUNT(*)::text AS c, MIN(reason) AS reason FROM tenant_player_bans
      WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}
    `
    expect(Number(rows[0]!.c)).toBe(1)

    const checked = await withTenantContext(tenant.id, (tx) => checkPlayerBanned(player.id, tenant.id, tx))
    expect(checked.banned).toBe(true)
    if (checked.banned) expect(checked.reason).toBe('Segundo motivo')
  })

  it('liftPlayerBan levanta el ban y el jugador puede reservar de nuevo', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    const courtId = await insertCourt(tenant.id)

    await withTenantContext(tenant.id, (tx) =>
      banPlayerManually(tenant.id, player.id, staff.id, 'Motivo temporal', null, tx),
    )

    let blockedFirst: unknown = null
    try {
      await withTenantContext(tenant.id, (tx) =>
        createOnlineBooking(
          tenant.id,
          {
            playerId: player.id,
            courtId,
            date: FUTURE_DATE,
            timeStart: '18:00',
            timeEnd: '19:00',
            requiresDeposit: false,
            depositPercentage: 0,
          },
          tx,
        ),
      )
    } catch (e) {
      blockedFirst = e
    }
    expect(blockedFirst).toBeInstanceOf(PlayerBannedError)

    const lifted = await withTenantContext(tenant.id, (tx) => liftPlayerBan(tenant.id, player.id, tx))
    expect(lifted).toBe(true)

    const checked = await withTenantContext(tenant.id, (tx) => checkPlayerBanned(player.id, tenant.id, tx))
    expect(checked.banned).toBe(false)

    // Mismo slot que el intento bloqueado: el intento fallido rollbackeó su
    // transacción entera (withTenantContext), así que no quedó ningún booking
    // insertado que choque acá.
    const booking = await withTenantContext(tenant.id, (tx) =>
      createOnlineBooking(
        tenant.id,
        {
          playerId: player.id,
          courtId,
          date: FUTURE_DATE,
          timeStart: '18:00',
          timeEnd: '19:00',
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('confirmed')
  })

  it('aislamiento cross-tenant: un ban manual en el tenant A no afecta la reserva del mismo jugador en el tenant B', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    const courtB = await insertCourt(tenantB.id)

    await withTenantContext(tenantA.id, (tx) =>
      banPlayerManually(tenantA.id, player.id, staff.id, 'Ban solo en A', null, tx),
    )

    const checkedB = await withTenantContext(tenantB.id, (tx) => checkPlayerBanned(player.id, tenantB.id, tx))
    expect(checkedB.banned).toBe(false)

    const booking = await withTenantContext(tenantB.id, (tx) =>
      createOnlineBooking(
        tenantB.id,
        {
          playerId: player.id,
          courtId: courtB,
          date: FUTURE_DATE,
          timeStart: '20:00',
          timeEnd: '21:00',
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      ),
    )
    expect(booking.status).toBe('confirmed')
  })
})
