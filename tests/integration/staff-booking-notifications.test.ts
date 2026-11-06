import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, withPlayerContext, withTenantContext, type DbTx } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { artDateOf } from '@/shared/time/art-date'
import { adminSql } from '../helpers/admin-db'
import {
  asApp,
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

beforeAll(async () => {
  await ensureRoles()
  await cleanupAll()
  setExpiryScheduler(async () => {})
})
afterAll(async () => {
  setExpiryScheduler(null)
  await closeSql()
})

async function setup() {
  const sql = adminSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  for (const role of ['admin', 'manager'] as const) {
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id, role)
  }
  await sql`INSERT INTO feature_flags (key, value, tenant_id) VALUES ('staff_notifications_v2',true,${tenant.id})`
  const courts = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id,name,capacity,pricing) VALUES (
      ${tenant.id},'Cancha Emisores',10,
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 }] })}
    ) RETURNING id
  `
  return { tenantId: tenant.id, playerId: player.id, courtId: courts[0]!.id }
}
type Ctx = Awaited<ReturnType<typeof setup>>
const input = (ctx: Ctx, deposit = false) => ({
  playerId: ctx.playerId,
  courtId: ctx.courtId,
  date: artDateOf(new Date(Date.now() + 86_400_000)),
  timeStart: '18:00',
  timeEnd: '19:00',
  requiresDeposit: deposit,
  depositPercentage: deposit ? 30 : 0,
})
const playerTx = <T>(ctx: Ctx, fn: (tx: DbTx) => Promise<T>) =>
  withPlayerContext(ctx.playerId, async (tx) => {
    await tx.execute(drizzleSql`SELECT set_config('app.current_tenant_id',${ctx.tenantId},true)`)
    return fn(tx)
  })
const create = (ctx: Ctx, deposit = false) =>
  playerTx(ctx, (tx) => createOnlineBooking(ctx.tenantId, input(ctx, deposit), tx))
const staffEvents = (ctx: Ctx) =>
  asApp(
    ctx.tenantId,
    (tx) => tx<{ channel: string; trigger_event: string; event_key: string | null }[]>`
  SELECT channel,trigger_event,event_key FROM notifications
  WHERE tenant_id=${ctx.tenantId} AND recipient_type='tenant_owner'
    AND (trigger_event IN ('booking.confirmed_online','booking.canceled_by_player','booking.admin_new_booking'))
  ORDER BY created_at
`,
  )

describe('emisores reales de reservas con notificaciones v2', () => {
  it('sin seña guarda una intención push por dueño/encargado, sin mail legacy; jugador conserva email', async () => {
    const ctx = await setup()
    const booking = await playerTx(ctx, async (tx) => {
      const row = await createOnlineBooking(ctx.tenantId, input(ctx), tx)
      const inTransaction = await tx.execute(drizzleSql`
        SELECT id FROM notifications WHERE tenant_id=${ctx.tenantId}
          AND trigger_event='booking.confirmed_online' AND channel='push'
      `)
      expect(inTransaction).toHaveLength(2)
      return row
    })
    expect(booking.status).toBe('confirmed')
    const events = await staffEvents(ctx)
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.channel === 'push')).toBe(true)
    const playerEmail = await asApp(
      ctx.tenantId,
      (tx) => tx`
      SELECT id FROM notifications WHERE tenant_id=${ctx.tenantId}
        AND recipient_type='player' AND channel='email' AND template_name='booking_confirmed'
    `,
    )
    expect(playerEmail).toHaveLength(1)
  })

  it('con seña pendiente no avisa al staff ni por push ni por mail', async () => {
    const ctx = await setup()
    const booking = await create(ctx, true)
    expect(booking.status).toBe('pending_payment')
    expect(await staffEvents(ctx)).toHaveLength(0)
  })

  it('sólo el ganador de la confirmación genera intenciones y el retry no agrega ninguna', async () => {
    const ctx = await setup()
    const booking = await create(ctx, true)
    const winner = await withTenantContext(ctx.tenantId, (tx) =>
      transitionFromPendingPayment(booking.id, 'confirmed', tx),
    )
    expect(winner.won).toBe(true)
    expect(await staffEvents(ctx)).toHaveLength(2)
    const retry = await withTenantContext(ctx.tenantId, (tx) =>
      transitionFromPendingPayment(booking.id, 'confirmed', tx),
    )
    expect(retry.won).toBe(false)
    expect(await staffEvents(ctx)).toHaveLength(2)
  })

  it('cancelar por jugador captura el aviso en la TX y el replay no lo duplica', async () => {
    const ctx = await setup()
    const booking = await create(ctx)
    await playerTx(ctx, async (tx) => {
      await cancelByPlayer(booking.id, ctx.playerId, undefined, tx)
      const queued = await tx.execute(drizzleSql`
        SELECT id FROM notifications WHERE tenant_id=${ctx.tenantId}
          AND trigger_event='booking.canceled_by_player' AND channel='push'
      `)
      expect(queued).toHaveLength(2)
    })
    const replay = await playerTx(ctx, (tx) =>
      cancelByPlayer(booking.id, ctx.playerId, undefined, tx),
    )
    expect(replay.replayed).toBe(true)
    expect(
      (await staffEvents(ctx)).filter((e) => e.trigger_event === 'booking.canceled_by_player'),
    ).toHaveLength(2)
  })

  it('rollback de alta no deja reserva ni avisos del staff', async () => {
    const ctx = await setup()
    await expect(
      playerTx(ctx, async (tx) => {
        await createOnlineBooking(ctx.tenantId, input(ctx), tx)
        throw new Error('rollback alta')
      }),
    ).rejects.toThrow('rollback alta')
    expect(await staffEvents(ctx)).toHaveLength(0)
    const bookings = await asApp(
      ctx.tenantId,
      (tx) => tx`SELECT id FROM bookings WHERE tenant_id=${ctx.tenantId}`,
    )
    expect(bookings).toHaveLength(0)
  })

  it('rollback de cancelación conserva la reserva y no deja avisos nuevos', async () => {
    const ctx = await setup()
    const booking = await create(ctx)
    await expect(
      playerTx(ctx, async (tx) => {
        await cancelByPlayer(booking.id, ctx.playerId, undefined, tx)
        throw new Error('rollback cancelación')
      }),
    ).rejects.toThrow('rollback cancelación')
    expect(
      (await staffEvents(ctx)).filter((e) => e.trigger_event === 'booking.canceled_by_player'),
    ).toHaveLength(0)
    const rows = await asApp(
      ctx.tenantId,
      (tx) => tx<{ status: string }[]>`SELECT status FROM bookings WHERE id=${booking.id}`,
    )
    expect(rows[0]!.status).toBe('confirmed')
  })
})
