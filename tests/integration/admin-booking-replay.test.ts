import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { physicalRange } from '@/shared/time/physical-range'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import {
  cancelByAdmin,
  cancelByPlayer,
  findNoShowReplay,
  handleNoShow,
} from '@/modules/bookings/booking.cancellation'
import { completeBooking, findCompletionReplay } from '@/modules/bookings/booking.service'
import {
  BookingNotCancelableError,
  BookingNotInConfirmedError,
} from '@/modules/bookings/booking.errors'
import { track } from '@/shared/observability'

/**
 * Reintentos de las acciones del panel sobre una reserva (demo 2026-10-14): la
 * respuesta tarda o se pierde, el staff vuelve a tocar y el segundo pedido llega
 * con el estado ya cambiado. El reintento del MISMO staff con los MISMOS datos
 * devuelve el estado actual sin escribir nada; cualquier otro caso sigue siendo
 * un error de estado. Mismo contrato que `cancelByPlayer` (cancellations.test.ts).
 */

const FUTURE_DATE = new Date(Date.now() + 500 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Replay Test'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertFutureConfirmed(opts: {
  tenantId: string
  courtId: string
  playerId: string | null
  timeStart: string
  timeEnd: string
  depositStatus?: string
  depositAmount?: number
}): Promise<string> {
  const sql = getSql()
  const { startsAt, endsAt } = physicalRange({
    date: FUTURE_DATE,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    physicallyNextDay: false,
  })
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${startsAt.toISOString()}, ${endsAt.toISOString()},
      ${800000}, ${opts.depositAmount ?? 0}, ${opts.depositStatus ?? 'not_required'},
      ${opts.depositStatus === 'paid' ? 'cash' : null}, 'confirmed'
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Turno de ayer (calendario ART, ver cancellations.test.ts): ya terminó. */
async function insertPastConfirmed(opts: {
  tenantId: string
  courtId: string
  playerId: string | null
  timeStart: string
  timeEnd: string
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, status
    ) VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '1 day', ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ((NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '1 day' + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ((NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '1 day' + ${opts.timeEnd}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${800_000}, 0, 'not_required', 'confirmed'
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Todo lo que una transición escribe, para comparar antes/después del reintento. */
async function writes(tenantId: string, bookingId: string, playerId: string | null) {
  const sql = getSql()
  const booking = (
    await sql`SELECT status, deposit_status, canceled_by, canceled_reason, canceled_at,
                     completed_by_staff, updated_at
              FROM bookings WHERE id = ${bookingId}`
  )[0]
  const count = async (q: Promise<Array<{ c: string }>>) => Number((await q)[0]!.c)
  return {
    booking,
    audits: await count(
      sql`SELECT COUNT(*)::text AS c FROM audit_logs WHERE resource_id = ${bookingId}`,
    ),
    playerAudits: playerId
      ? await count(sql`SELECT COUNT(*)::text AS c FROM audit_logs WHERE resource_id = ${playerId}`)
      : 0,
    refunds: await count(
      sql`SELECT COUNT(*)::text AS c FROM payments WHERE booking_id = ${bookingId} AND type = 'refund'`,
    ),
    mails: await count(
      sql`SELECT COUNT(*)::text AS c FROM notifications WHERE tenant_id = ${tenantId}`,
    ),
    noshows: playerId
      ? Number(
          (
            await sql<{ n: number | null }[]>`
              SELECT noshow_count AS n FROM player_tenant_relationships
              WHERE tenant_id = ${tenantId} AND player_id = ${playerId}`
          )[0]?.n ?? 0,
        )
      : 0,
  }
}

async function setup() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const other = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, other.id, 'manager')
  const courtId = await insertCourt(tenant.id)
  return { tenant, player, staff, other, courtId }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('cancelByAdmin — idempotencia del reintento', () => {
  it('mismo staff, mismo motivo y tipo: replayed:true y no se escribe NADA', async () => {
    const { tenant, player, staff, courtId } = await setup()
    const bookingId = await insertFutureConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '08:00',
      timeEnd: '09:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    const first = await withTenantContext(tenant.id, (tx) =>
      cancelByAdmin(bookingId, staff.id, 'lluvia', 'complejo', tx),
    )
    expect(first.replayed).toBeUndefined()
    const before = await writes(tenant.id, bookingId, player.id)
    expect(before).toMatchObject({
      audits: 1,
      refunds: 1,
      mails: 1,
      booking: { status: 'canceled_refunded' },
    })

    const trackSpy = vi.spyOn(track, 'booking')
    try {
      const replay = await withTenantContext(tenant.id, (tx) =>
        cancelByAdmin(bookingId, staff.id, 'lluvia', 'complejo', tx),
      )
      expect(replay.replayed).toBe(true)
      expect(replay.notificationIds).toEqual([])
      expect(replay.booking).toMatchObject({ id: bookingId, status: 'canceled_refunded' })
      expect(trackSpy).not.toHaveBeenCalled()
    } finally {
      trackSpy.mockRestore()
    }
    expect(await writes(tenant.id, bookingId, player.id)).toEqual(before)
  })

  for (const [label, who, reason, type] of [
    ['otro staff', 'other', 'lluvia', 'complejo'],
    ['mismo staff, otro motivo', 'staff', 'cancha rota', 'complejo'],
    ['mismo staff, otro tipo', 'staff', 'lluvia', 'jugador'],
  ] as const) {
    it(`${label}: error de estado (BookingNotCancelableError) y nada escrito`, async () => {
      const ctx = await setup()
      const bookingId = await insertFutureConfirmed({
        tenantId: ctx.tenant.id,
        courtId: ctx.courtId,
        playerId: ctx.player.id,
        timeStart: '09:00',
        timeEnd: '10:00',
      })
      await withTenantContext(ctx.tenant.id, (tx) =>
        cancelByAdmin(bookingId, ctx.staff.id, 'lluvia', 'complejo', tx),
      )
      const before = await writes(ctx.tenant.id, bookingId, ctx.player.id)

      const err = await withTenantContext(ctx.tenant.id, (tx) =>
        cancelByAdmin(bookingId, ctx[who].id, reason, type, tx),
      ).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(BookingNotCancelableError)
      expect(err).toBeInstanceOf(BookingNotInConfirmedError)
      expect(err).toMatchObject({ status: 'canceled_no_refund', canceledBy: 'admin' })
      expect(await writes(ctx.tenant.id, bookingId, ctx.player.id)).toEqual(before)
    })
  }

  it('cancelada por el jugador: el panel recibe el error de estado, no un replay', async () => {
    const { tenant, player, staff, courtId } = await setup()
    const bookingId = await insertFutureConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '10:00',
      timeEnd: '11:00',
    })
    await withTenantContext(tenant.id, (tx) => cancelByPlayer(bookingId, player.id, undefined, tx))

    await expect(
      withTenantContext(tenant.id, (tx) =>
        cancelByAdmin(bookingId, staff.id, 'lluvia', 'complejo', tx),
      ),
    ).rejects.toMatchObject({ name: 'BookingNotCancelableError', canceledBy: 'player' })
  })

  it('dos pedidos concurrentes del mismo staff: uno cancela, el otro es replay (un audit, un mail)', async () => {
    const { tenant, player, staff, courtId } = await setup()
    const bookingId = await insertFutureConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '11:00',
      timeEnd: '12:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    const outcomes = await Promise.all(
      [0, 1].map(() =>
        withTenantContext(tenant.id, (tx) =>
          cancelByAdmin(bookingId, staff.id, 'lluvia', 'complejo', tx),
        ),
      ),
    )

    expect(outcomes.filter((o) => o.replayed === true)).toHaveLength(1)
    expect(await writes(tenant.id, bookingId, player.id)).toMatchObject({
      audits: 1,
      refunds: 1,
      mails: 1,
    })
  })

  it('complejo sin política de cancelación guardada: decide con el default en vez de romper', async () => {
    const { tenant, player, staff, courtId } = await setup()
    const sql = getSql()
    await sql`UPDATE tenants SET settings = settings - 'cancellation_policy' WHERE id = ${tenant.id}`
    const bookingId = await insertFutureConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '12:00',
      timeEnd: '13:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    // 'jugador' aplica la política: +500 días queda adentro del default de 12 h.
    const outcome = await withTenantContext(tenant.id, (tx) =>
      cancelByAdmin(bookingId, staff.id, 'pidió cancelar', 'jugador', tx),
    )
    expect(outcome.booking.status).toBe('canceled_refunded')
  })
})

describe('findNoShowReplay — reintento de "No vino"', () => {
  it('mismo staff: devuelve la reserva y, sin handleNoShow, no hay segundo audit ni strike', async () => {
    const { tenant, player, staff, other, courtId } = await setup()
    const bookingId = await insertPastConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '18:00',
      timeEnd: '19:00',
    })

    // Antes de marcar: no hay replay (sigue confirmada).
    expect(
      await withTenantContext(tenant.id, (tx) => findNoShowReplay(bookingId, staff.id, tx)),
    ).toBeNull()

    await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx))
    const before = await writes(tenant.id, bookingId, player.id)
    expect(before.noshows).toBe(1)

    const replay = await withTenantContext(tenant.id, (tx) =>
      findNoShowReplay(bookingId, staff.id, tx),
    )
    expect(replay).toMatchObject({ id: bookingId, status: 'no_show' })
    expect(await writes(tenant.id, bookingId, player.id)).toEqual(before)

    // Otro staff no es replay: el caller sigue a handleNoShow, que tira el error de estado.
    expect(
      await withTenantContext(tenant.id, (tx) => findNoShowReplay(bookingId, other.id, tx)),
    ).toBeNull()
    await expect(
      withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, other.id, tx)),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)
    expect(await writes(tenant.id, bookingId, player.id)).toEqual(before)
  })

  it('dos pedidos concurrentes del mismo staff (como los hace markNoShowAction): un solo strike', async () => {
    const { tenant, player, staff, courtId } = await setup()
    const bookingId = await insertPastConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '19:00',
      timeEnd: '20:00',
    })

    const results = await Promise.all(
      [0, 1].map(() =>
        withTenantContext(
          tenant.id,
          async (tx) =>
            (await findNoShowReplay(bookingId, staff.id, tx)) ??
            handleNoShow(bookingId, staff.id, tx),
        ),
      ),
    )

    expect(results.map((b) => b.status)).toEqual(['no_show', 'no_show'])
    const after = await writes(tenant.id, bookingId, player.id)
    expect(after.noshows).toBe(1)
    expect(after.audits).toBe(1)
  })
})

describe('findCompletionReplay — reintento de "completar"', () => {
  it('solo el staff que la completó recibe el replay, sin escribir nada', async () => {
    const { tenant, player, staff, other, courtId } = await setup()
    const bookingId = await insertPastConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '16:00',
      timeEnd: '17:00',
    })

    expect(
      await withTenantContext(tenant.id, (tx) => findCompletionReplay(bookingId, staff.id, tx)),
    ).toBeNull()

    await withTenantContext(tenant.id, (tx) => completeBooking(bookingId, 'admin', tx, staff.id))
    const before = await writes(tenant.id, bookingId, player.id)

    const replay = await withTenantContext(tenant.id, (tx) =>
      findCompletionReplay(bookingId, staff.id, tx),
    )
    expect(replay).toMatchObject({ id: bookingId, status: 'completed' })
    expect(
      await withTenantContext(tenant.id, (tx) => findCompletionReplay(bookingId, other.id, tx)),
    ).toBeNull()
    expect(await writes(tenant.id, bookingId, player.id)).toEqual(before)
  })

  it('dos pedidos concurrentes del mismo staff: uno completa, el otro es replay', async () => {
    const { tenant, player, staff, courtId } = await setup()
    const bookingId = await insertPastConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '17:00',
      timeEnd: '18:00',
    })

    const results = await Promise.all(
      [0, 1].map(() =>
        withTenantContext(tenant.id, async (tx) => {
          const replay = await findCompletionReplay(bookingId, staff.id, tx)
          if (replay) return 'replay'
          await completeBooking(bookingId, 'admin', tx, staff.id)
          return 'completed'
        }),
      ),
    )

    expect(results.sort()).toEqual(['completed', 'replay'])
  })
})
