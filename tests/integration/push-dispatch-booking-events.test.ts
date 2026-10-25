/**
 * Integration: los avisos push al admin de las reservas online y del plan SaaS llegan a
 * `pgboss.job` con el contexto real de la DB (cancha, día, hora) y respetando a quién
 * le toca cada uno.
 *
 * Requiere Supabase local (`pnpm supabase:start`) y las variables de DB en la misma línea
 * del comando (sin ellas el cleanup trunca la DB local). Falla si la DB no está: sin base
 * no hay señal que dar.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { getBoss, stopBoss } from '@/shared/jobs/boss'
import { physicalRange } from '@/shared/time/physical-range'
import { cancelByAdmin, cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import {
  notifyAdminBookingCanceled,
  notifyAdminBookingConfirmed,
  notifyOwnerPlanEvent,
} from '@/modules/notifications/push.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const DAY_MS = 24 * 60 * 60 * 1000
// Las reservas están ~500 días adelante: con `late_cancel_hours` en 20.000 (~833 días)
// cancelar AHORA es "tarde"; con 0 (apagado) no.
const LATE_HOURS = 20_000

function futureDay(offset: number): string {
  return new Date(Date.now() + 500 * DAY_MS + offset * DAY_MS).toISOString().slice(0, 10)
}

async function setup(lateCancelHours: number) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const courts = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenant.id}, ${'Cancha Push Test'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 }] })},
      'online'
    )
    RETURNING id
  `
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ late_cancel_hours: lateCancelHours })}
    WHERE id = ${tenant.id}
  `
  // Un dueño y un encargado, cada uno con un dispositivo suscripto.
  const owner = await createTestStaffUser(sql)
  const manager = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, owner.id, 'admin')
  await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
  const subscribe = async (staffId: string, label: string) => {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES (${tenant.id}, ${staffId}, ${`https://push.example.com/${label}-${tenant.id}`}, 'p256dh', 'auth')
      RETURNING id
    `
    return rows[0]!.id
  }
  const ownerSub = await subscribe(owner.id, 'owner')
  const managerSub = await subscribe(manager.id, 'manager')
  return { tenant, player, courtId: courts[0]!.id, owner, manager, ownerSub, managerSub }
}

type Ctx = Awaited<ReturnType<typeof setup>>

async function book(ctx: Ctx, offset: number): Promise<{ id: string; date: string }> {
  const sql = getSql()
  const date = futureDay(offset)
  const { startsAt, endsAt } = physicalRange({
    date,
    timeStart: '21:00',
    timeEnd: '22:00',
    physicallyNextDay: false,
  })
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${ctx.tenant.id}, ${ctx.courtId}, ${ctx.player.id}, ${date}::date, '21:00', '22:00',
      ${startsAt.toISOString()}, ${endsAt.toISOString()},
      ${800000}, ${0}, 'not_required', NULL, 'confirmed'
    )
    RETURNING id
  `
  return { id: rows[0]!.id, date }
}

type PushJob = { subscription_id: string; dedupeKey?: string; payload: Record<string, unknown> }

/** Jobs `push-send` que quedaron en la cola para las suscripciones de este complejo. */
async function pushJobs(ctx: Ctx): Promise<PushJob[]> {
  const sql = getSql()
  const rows = await sql<{ data: PushJob }[]>`
    SELECT data FROM pgboss.job
    WHERE name = 'push-send'
      AND data->>'subscription_id' IN (${ctx.ownerSub}, ${ctx.managerSub})
    ORDER BY createdon
  `
  return rows.map((r) => r.data)
}

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
  // Crea el schema de pg-boss si todavía no está.
  await getBoss()
}, 30_000)

beforeEach(async () => {
  await getSql()`DELETE FROM pgboss.job WHERE name = 'push-send'`
})

afterAll(async () => {
  try {
    await getSql()`DELETE FROM pgboss.job WHERE name = 'push-send'`
    await stopBoss()
    await closeSql()
  } catch {
    // best-effort cleanup
  }
})

describe('reserva online confirmada sin seña', () => {
  it('encola un push por dispositivo de TODO el staff, con cancha, día y hora reales', async () => {
    const ctx = await setup(0)
    const booking = await book(ctx, 1)

    await notifyAdminBookingConfirmed(ctx.tenant.id, booking.id)

    const jobs = await pushJobs(ctx)
    expect(jobs.map((j) => j.subscription_id).sort()).toEqual([ctx.ownerSub, ctx.managerSub].sort())
    for (const job of jobs) {
      expect(job.dedupeKey).toBe(`push:booking-confirmed:${booking.id}:${job.subscription_id}`)
      expect(job.payload).toMatchObject({
        type: 'booking.confirmed_online',
        bookingId: booking.id,
        courtName: 'Cancha Push Test',
        timeLabel: '21:00–22:00',
        url: `/grilla?date=${booking.date}&highlight=${booking.id}`,
      })
    }
  })

  it('una reserva que no existe no tira: avisa igual con lo que hay', async () => {
    const ctx = await setup(0)
    await expect(
      notifyAdminBookingConfirmed(ctx.tenant.id, '00000000-0000-4000-8000-000000000000'),
    ).resolves.toBeUndefined()
  })
})

describe('cancelación del jugador', () => {
  const cancelAsPlayer = (ctx: Ctx, bookingId: string) =>
    withTenantContext(ctx.tenant.id, (tx) =>
      cancelByPlayer(bookingId, ctx.player.id, undefined, tx),
    )

  it('cancelación común: un push por dispositivo, late: false, abre la grilla de ese día', async () => {
    const ctx = await setup(0)
    const booking = await book(ctx, 1)

    const outcome = await cancelAsPlayer(ctx, booking.id)
    expect(outcome.lateCancel).toBe(false)
    await notifyAdminBookingCanceled(ctx.tenant.id, booking.id, {
      late: outcome.lateCancel === true,
    })

    const jobs = await pushJobs(ctx)
    expect(jobs).toHaveLength(2)
    for (const job of jobs) {
      expect(job.dedupeKey).toBe(`push:booking-canceled:${booking.id}:${job.subscription_id}`)
      expect(job.payload).toMatchObject({
        type: 'booking.canceled_by_player',
        bookingId: booking.id,
        late: false,
        title: 'Reserva cancelada — Cancha Push Test',
        url: `/grilla?date=${booking.date}`,
      })
    }
  })

  it('cancelación tardía: el outcome lo marca y el push sale como "Cancelación tardía"', async () => {
    const ctx = await setup(LATE_HOURS)
    const booking = await book(ctx, 1)

    const outcome = await cancelAsPlayer(ctx, booking.id)
    expect(outcome.lateCancel).toBe(true)
    await notifyAdminBookingCanceled(ctx.tenant.id, booking.id, {
      late: outcome.lateCancel === true,
    })

    const jobs = await pushJobs(ctx)
    expect(jobs).toHaveLength(2)
    expect(jobs[0]!.payload).toMatchObject({
      late: true,
      title: 'Cancelación tardía — Cancha Push Test',
    })
  })

  it('replay: el reintento llega marcado como replayed y sin lateCancel (la action no avisa de nuevo)', async () => {
    const ctx = await setup(LATE_HOURS)
    const booking = await book(ctx, 1)

    const first = await cancelAsPlayer(ctx, booking.id)
    expect(first.replayed).toBeUndefined()

    const second = await cancelAsPlayer(ctx, booking.id)
    expect(second.replayed).toBe(true)
    expect(second.lateCancel).toBeUndefined()
  })

  it('cancelByAdmin no encola ningún push: lo hizo el propio staff', async () => {
    const ctx = await setup(0)
    const booking = await book(ctx, 1)

    await withTenantContext(ctx.tenant.id, (tx) =>
      cancelByAdmin(booking.id, ctx.owner.id, 'motivo', 'complejo', tx),
    )

    expect(await pushJobs(ctx)).toHaveLength(0)
  })
})

describe('aviso de plan SaaS', () => {
  it('va SOLO al dueño: el encargado no ve facturación', async () => {
    const ctx = await setup(0)

    await notifyOwnerPlanEvent(ctx.tenant.id, { event: 'trial_expired' }, 'trial-fin')

    const jobs = await pushJobs(ctx)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.subscription_id).toBe(ctx.ownerSub)
    expect(jobs[0]!.dedupeKey).toBe(
      `push:plan.trial_expired:${ctx.tenant.id}:trial-fin:${ctx.ownerSub}`,
    )
    expect(jobs[0]!.payload).toMatchObject({
      type: 'plan.trial_expired',
      title: 'Terminó tu prueba',
      url: '/settings/facturacion',
    })
  })

  it('un dueño dado de baja (is_active = false) no recibe el aviso', async () => {
    const ctx = await setup(0)
    await getSql()`
      UPDATE tenant_staff_members SET is_active = false
      WHERE tenant_id = ${ctx.tenant.id} AND staff_user_id = ${ctx.owner.id}
    `

    await notifyOwnerPlanEvent(ctx.tenant.id, { event: 'suspended' }, 'susp-1')

    expect(await pushJobs(ctx)).toHaveLength(0)
  })
})
