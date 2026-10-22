import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { physicalRange } from '@/shared/time/physical-range'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-gateway.implementation', () => {
  return {
    MercadoPagoGateway: class {
      constructor(_encryptedAccessToken: string) {}
      createPreference = (...args: Parameters<MockGateway['createPreference']>) =>
        mockGateway.createPreference(...args)
      getPaymentStatus = (...args: Parameters<MockGateway['getPaymentStatus']>) =>
        mockGateway.getPaymentStatus(...args)
    },
  }
})

import { cancelByAdmin, cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { revertNoShowStrike } from '@/modules/relationships/ptr.service'

// Cancelación tardía sin seña (docs/decisions/2026-10-21-cancelacion-tardia.md).
// Las reservas están ~500 días adelante: con `late_cancel_hours` en 20.000 (~833 días)
// cancelar AHORA es "tarde"; con 0 (apagado) no. Cada reserva usa un día distinto.
const LATE_HOURS = 20_000
const DAY_MS = 24 * 60 * 60 * 1000

function futureDay(offset: number): string {
  return new Date(Date.now() + 500 * DAY_MS + offset * DAY_MS).toISOString().slice(0, 10)
}

async function setup(hours: number) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const courts = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenant.id}, ${'Cancha Late Test'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 }] })},
      'online'
    )
    RETURNING id
  `
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ late_cancel_hours: hours })}
    WHERE id = ${tenant.id}
  `
  return { tenant, player, courtId: courts[0]!.id }
}

type Ctx = Awaited<ReturnType<typeof setup>>

async function book(ctx: Ctx, offset: number, depositStatus = 'not_required'): Promise<string> {
  const sql = getSql()
  const date = futureDay(offset)
  const { startsAt, endsAt } = physicalRange({
    date,
    timeStart: '12:00',
    timeEnd: '13:00',
    physicallyNextDay: false,
  })
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${ctx.tenant.id}, ${ctx.courtId}, ${ctx.player.id}, ${date}::date, '12:00', '13:00',
      ${startsAt.toISOString()}, ${endsAt.toISOString()},
      ${800000}, ${0}, ${depositStatus}, NULL, 'confirmed'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function getCanceledLate(bookingId: string): Promise<boolean> {
  const sql = getSql()
  const rows = await sql<{ canceled_late: boolean }[]>`
    SELECT canceled_late FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.canceled_late
}

async function getBan(
  tenantId: string,
  playerId: string,
): Promise<{ reason: string; days: number } | null> {
  const sql = getSql()
  const rows = await sql<{ reason: string; days: string }[]>`
    SELECT reason, EXTRACT(EPOCH FROM (banned_until - NOW())) / 86400 AS days
    FROM tenant_player_bans
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId} AND banned_until > NOW()
    LIMIT 1
  `
  return rows[0] ? { reason: rows[0].reason, days: Number(rows[0].days) } : null
}

async function countBans(tenantId: string, playerId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM tenant_player_bans
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `
  return Number(rows[0]!.c)
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('cancelación tardía sin seña', () => {
  it('escalera: 1ra solo marca, 2da bloquea 7 días, 3ra bloquea 30 (jugador)', async () => {
    const ctx = await setup(LATE_HOURS)
    const [b1, b2, b3] = [await book(ctx, 1), await book(ctx, 2), await book(ctx, 3)]
    const cancel = (id: string) =>
      withTenantContext(ctx.tenant.id, (tx) => cancelByPlayer(id, ctx.player.id, undefined, tx))

    await cancel(b1)
    expect(await getCanceledLate(b1)).toBe(true)
    expect(await getBan(ctx.tenant.id, ctx.player.id)).toBeNull()

    await cancel(b2)
    const ban2 = await getBan(ctx.tenant.id, ctx.player.id)
    expect(ban2?.reason).toBe('Cancelaciones tardías reiteradas')
    expect(ban2!.days).toBeGreaterThan(6.9)
    expect(ban2!.days).toBeLessThan(7.1)

    await cancel(b3)
    const ban3 = await getBan(ctx.tenant.id, ctx.player.id)
    expect(ban3!.days).toBeGreaterThan(29.9)
    expect(ban3!.days).toBeLessThan(30.1)
    expect(await countBans(ctx.tenant.id, ctx.player.id)).toBe(1)
  })

  it('apagada (late_cancel_hours 0): no marca ni bloquea', async () => {
    const ctx = await setup(0)
    const [b1, b2] = [await book(ctx, 1), await book(ctx, 2)]
    await withTenantContext(ctx.tenant.id, async (tx) => {
      await cancelByPlayer(b1, ctx.player.id, undefined, tx)
      await cancelByPlayer(b2, ctx.player.id, undefined, tx)
    })
    expect(await getCanceledLate(b1)).toBe(false)
    expect(await getCanceledLate(b2)).toBe(false)
    expect(await getBan(ctx.tenant.id, ctx.player.id)).toBeNull()
  })

  it('con seña no penaliza aunque el setting esté prendido', async () => {
    const ctx = await setup(LATE_HOURS)
    const ids = [await book(ctx, 1, 'captured'), await book(ctx, 2, 'captured')]
    await withTenantContext(ctx.tenant.id, async (tx) => {
      for (const id of ids) await cancelByPlayer(id, ctx.player.id, undefined, tx)
    })
    for (const id of ids) expect(await getCanceledLate(id)).toBe(false)
    expect(await getBan(ctx.tenant.id, ctx.player.id)).toBeNull()
  })

  it('staff "a pedido del jugador" cuenta; "cancela el complejo" nunca', async () => {
    const sql = getSql()
    const ctx = await setup(LATE_HOURS)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, ctx.tenant.id, staff.id)
    const [byComplex, byPlayer1, byPlayer2] = [
      await book(ctx, 1),
      await book(ctx, 2),
      await book(ctx, 3),
    ]
    const adminCancel = (id: string, type: 'jugador' | 'complejo') =>
      withTenantContext(ctx.tenant.id, (tx) => cancelByAdmin(id, staff.id, 'motivo', type, tx))

    await adminCancel(byComplex, 'complejo')
    expect(await getCanceledLate(byComplex)).toBe(false)

    await adminCancel(byPlayer1, 'jugador')
    expect(await getCanceledLate(byPlayer1)).toBe(true)
    expect(await getBan(ctx.tenant.id, ctx.player.id)).toBeNull()

    await adminCancel(byPlayer2, 'jugador')
    // La del complejo no sumó: la 2da tardía real bloquea 7 días.
    const ban = await getBan(ctx.tenant.id, ctx.player.id)
    expect(ban!.days).toBeGreaterThan(6.9)
    expect(ban!.days).toBeLessThan(7.1)
  })

  it('a los 60 días limpios el contador vuelve a cero', async () => {
    const sql = getSql()
    const ctx = await setup(LATE_HOURS)
    const { startsAt, endsAt } = physicalRange({
      date: futureDay(50),
      timeStart: '10:00',
      timeEnd: '11:00',
      physicallyNextDay: false,
    })
    // Una tardía de hace 61 días: fuera de la ventana, no cuenta.
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, status, canceled_at, canceled_late
      )
      VALUES (
        ${ctx.tenant.id}, ${ctx.courtId}, ${ctx.player.id}, ${futureDay(50)}::date, '10:00', '11:00',
        ${startsAt.toISOString()}, ${endsAt.toISOString()},
        ${800000}, 0, 'not_required', 'canceled_no_refund', NOW() - INTERVAL '61 days', true
      )
    `
    const b = await book(ctx, 1)
    await withTenantContext(ctx.tenant.id, (tx) => cancelByPlayer(b, ctx.player.id, undefined, tx))
    expect(await getCanceledLate(b)).toBe(true)
    expect(await getBan(ctx.tenant.id, ctx.player.id)).toBeNull() // cuenta como la 1ra: solo aviso
  })

  it('revertNoShowStrike no levanta el bloqueo por cancelaciones tardías', async () => {
    const ctx = await setup(LATE_HOURS)
    const [b1, b2] = [await book(ctx, 1), await book(ctx, 2)]
    await withTenantContext(ctx.tenant.id, async (tx) => {
      await cancelByPlayer(b1, ctx.player.id, undefined, tx)
      await cancelByPlayer(b2, ctx.player.id, undefined, tx)
    })
    expect(await getBan(ctx.tenant.id, ctx.player.id)).not.toBeNull()

    await withTenantContext(ctx.tenant.id, (tx) =>
      revertNoShowStrike(ctx.tenant.id, ctx.player.id, b2, tx),
    )
    expect(await getBan(ctx.tenant.id, ctx.player.id)).not.toBeNull()
  })
})
