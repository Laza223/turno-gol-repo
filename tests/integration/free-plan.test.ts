import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { FreeOnlineCapReachedError } from '@/modules/bookings/booking.errors'
import { InvalidTransitionError } from '@/modules/billing/billing.errors'
import {
  evaluateFreeOnlinePause,
  resumeFreeOnlineBooking,
} from '@/modules/bookings/free-online-pause'
import { transitionToActiveFromAny, transitionToFree } from '@/modules/billing/lifecycle.service'
import { scheduleInactiveFreeDeletion } from '@/shared/jobs/workers/data-retention-cleanup.worker'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { artMonthOf } from '@/modules/tenants/tenant.lifecycle'
import {
  FREE_ONLINE_BOOKINGS_PER_MONTH,
  FREE_ONLINE_CANCEL_PAUSE_THRESHOLD,
} from '@/shared/constants'
import { cleanupAll, createTestPlayer, createTestTenant, ensureRoles } from '../helpers/tenant'
import { getOrCreatePlanId, insertSubscription } from '../helpers/factories'

/**
 * Freemium (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md) contra
 * Postgres real: transiciones a y desde `free`, el tope mensual de reservas
 * online (también con dos reservas a la vez), la pausa por cancelaciones del
 * dueño y el barrido del gratis abandonado.
 */

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

async function insertCourt(tenantId: string, name: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${name}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

/** Reservas online ya creadas este mes, una por día a partir de 2027-03-01. */
async function insertOnlineBookings(
  tenantId: string,
  courtId: string,
  n: number,
  extra: { status?: string; canceledBy?: 'player' | 'admin' } = {},
  firstDay = 1,
): Promise<void> {
  const sql = getSql()
  for (let i = 0; i < n; i++) {
    const date = `2027-03-${String(firstDay + i).padStart(2, '0')}`
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        type, price_snapshot, deposit_amount, deposit_status, status, canceled_by, canceled_at
      ) VALUES (
        ${tenantId}, ${courtId}, ${date}::date, '10:00'::time, '11:00'::time,
        (${date}::date + '10:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${date}::date + '11:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        'spontaneous', 800000, 0, 'not_required',
        ${extra.status ?? 'confirmed'}::booking_status,
        ${extra.canceledBy ?? null}::cancellation_actor,
        ${extra.canceledBy ? sql`NOW()` : null}
      )
    `
  }
}

async function makeFree(tenantId: string): Promise<void> {
  await getSql()`UPDATE tenants SET status = 'free'::tenant_status WHERE id = ${tenantId}`
}

function book(tenantId: string, playerId: string, courtId: string, date: string) {
  return withTenantContext(tenantId, (tx) =>
    createOnlineBooking(
      tenantId,
      {
        playerId,
        courtId,
        date,
        timeStart: '20:00',
        timeEnd: '21:00',
        requiresDeposit: false,
        depositPercentage: 0,
      },
      tx,
    ),
  )
}

beforeAll(async () => {
  setExpiryScheduler(async () => {})
  await ensureRoles(getSql())
}, 30_000)

beforeEach(async () => {
  await cleanupAll(getSql())
}, 30_000)

afterAll(async () => {
  setExpiryScheduler(null)
  await cleanupAll(getSql())
  await closeSql()
})

describe('transiciones del plan gratis', () => {
  it('trialing → free al vencer la prueba, y free → active al pagar', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId: await getOrCreatePlanId(sql) })

    await withTenantContext(tenant.id, (tx) => transitionToFree(tenant.id, 'trial_expired', tx))
    const [afterFree] = await sql<{ status: string; sub: string }[]>`
      SELECT t.status::text AS status, s.status::text AS sub
      FROM tenants t JOIN tenant_subscriptions s ON s.tenant_id = t.id WHERE t.id = ${tenant.id}
    `
    expect(afterFree).toEqual({ status: 'free', sub: 'free' })

    const start = new Date()
    const end = new Date(start.getTime() + 30 * 86_400_000)
    await withTenantContext(tenant.id, (tx) => transitionToActiveFromAny(tenant.id, start, end, tx))
    const [afterPay] = await sql<{ status: string; sub: string }[]>`
      SELECT t.status::text AS status, s.status::text AS sub
      FROM tenants t JOIN tenant_subscriptions s ON s.tenant_id = t.id WHERE t.id = ${tenant.id}
    `
    expect(afterPay).toEqual({ status: 'active', sub: 'active' })
  })

  it('el origen manda: una suscripción activa no baja a free por "prueba vencida"', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await insertSubscription(sql, {
      tenantId: tenant.id,
      planId: await getOrCreatePlanId(sql),
      status: 'active',
    })
    await sql`UPDATE tenants SET status = 'active'::tenant_status WHERE id = ${tenant.id}`

    await expect(
      withTenantContext(tenant.id, (tx) => transitionToFree(tenant.id, 'trial_expired', tx)),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    const [row] = await sql<{ status: string }[]>`
      SELECT status::text AS status FROM tenants WHERE id = ${tenant.id}
    `
    expect(row!.status).toBe('active')
  })
})

describe(`tope de ${FREE_ONLINE_BOOKINGS_PER_MONTH} reservas online por mes`, () => {
  it('la que completa el tope entra y marca el mes; la siguiente rebota', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await makeFree(tenant.id)
    const court = await insertCourt(tenant.id, 'Cancha 1')
    await insertOnlineBookings(tenant.id, court, FREE_ONLINE_BOOKINGS_PER_MONTH - 1)
    // Las que canceló el jugador no cuentan: si contaran, la de abajo ya rebotaría.
    await insertOnlineBookings(
      tenant.id,
      court,
      2,
      { status: 'canceled_no_refund', canceledBy: 'player' },
      25,
    )
    const p1 = await createTestPlayer(sql)
    const p2 = await createTestPlayer(sql)

    await book(tenant.id, p1.id, court, '2027-04-05')
    const [t1] = await sql<{ online_cap_month: string | null }[]>`
      SELECT online_cap_month FROM tenants WHERE id = ${tenant.id}
    `
    expect(t1!.online_cap_month).toBe(artMonthOf())

    const err = await book(tenant.id, p2.id, court, '2027-04-06').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FreeOnlineCapReachedError)
  }, 30_000)

  it('dos reservas a la vez con un lugar libre: entra una sola', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await makeFree(tenant.id)
    const courtA = await insertCourt(tenant.id, 'Cancha A')
    const courtB = await insertCourt(tenant.id, 'Cancha B')
    await insertOnlineBookings(tenant.id, courtA, FREE_ONLINE_BOOKINGS_PER_MONTH - 1)
    const p1 = await createTestPlayer(sql)
    const p2 = await createTestPlayer(sql)

    const results = await Promise.allSettled([
      book(tenant.id, p1.id, courtA, '2027-04-07'),
      book(tenant.id, p2.id, courtB, '2027-04-07'),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(FreeOnlineCapReachedError)
    const [count] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings
      WHERE tenant_id = ${tenant.id} AND date = '2027-04-07'::date
    `
    expect(count!.n).toBe(1)
  }, 30_000)

  it('un complejo pago no tiene tope', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'active'::tenant_status WHERE id = ${tenant.id}`
    const court = await insertCourt(tenant.id, 'Cancha 1')
    await insertOnlineBookings(tenant.id, court, FREE_ONLINE_BOOKINGS_PER_MONTH)
    const p1 = await createTestPlayer(sql)

    await expect(book(tenant.id, p1.id, court, '2027-04-08')).resolves.toBeTruthy()
  }, 30_000)
})

describe(`pausa por ${FREE_ONLINE_CANCEL_PAUSE_THRESHOLD} cancelaciones del dueño`, () => {
  it('pausa al llegar al umbral, "Ya marqué mis ocupados" la levanta y reinicia la cuenta', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await makeFree(tenant.id)
    const court = await insertCourt(tenant.id, 'Cancha 1')

    await insertOnlineBookings(tenant.id, court, FREE_ONLINE_CANCEL_PAUSE_THRESHOLD - 1, {
      status: 'canceled_no_refund',
      canceledBy: 'admin',
    })
    expect(await evaluateFreeOnlinePause(tenant.id)).toBe(false)

    await insertOnlineBookings(
      tenant.id,
      court,
      1,
      { status: 'canceled_no_refund', canceledBy: 'admin' },
      20,
    )
    expect(await evaluateFreeOnlinePause(tenant.id)).toBe(true)
    const p1 = await createTestPlayer(sql)
    const err = await book(tenant.id, p1.id, court, '2027-04-09').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FreeOnlineCapReachedError)

    await withTenantContext(tenant.id, (tx) => resumeFreeOnlineBooking(tenant.id, tx))
    // Las cancelaciones de antes de reanudar ya no cuentan.
    expect(await evaluateFreeOnlinePause(tenant.id)).toBe(false)
    await expect(book(tenant.id, p1.id, court, '2027-04-09')).resolves.toBeTruthy()
  }, 30_000)

  it('las que cancela el jugador no pausan', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await makeFree(tenant.id)
    const court = await insertCourt(tenant.id, 'Cancha 1')
    await insertOnlineBookings(tenant.id, court, FREE_ONLINE_CANCEL_PAUSE_THRESHOLD + 1, {
      status: 'canceled_no_refund',
      canceledBy: 'player',
    })

    expect(await evaluateFreeOnlinePause(tenant.id)).toBe(false)
  }, 30_000)
})

describe('gratis abandonado (6 meses sin uso)', () => {
  it('agenda el borrado solo del gratis sin visitas ni reservas recientes', async () => {
    const sql = getSql()
    const abandoned = await createTestTenant(sql)
    const visited = await createTestTenant(sql)
    const paying = await createTestTenant(sql)
    const justDowngraded = await createTestTenant(sql)
    await sql`
      UPDATE tenants SET status = 'free'::tenant_status, created_at = NOW() - INTERVAL '400 days'
      WHERE id IN (${abandoned.id}, ${visited.id}, ${justDowngraded.id})
    `
    // Backfill de hoy: viejo y sin visitas, pero recién bajado a gratis.
    await sql`
      INSERT INTO audit_logs (tenant_id, actor_id, actor_type, action, resource_type, resource_id)
      VALUES (${justDowngraded.id}, '00000000-0000-0000-0000-000000000000', 'system',
              'tenant.downgraded_to_free', 'tenant', ${justDowngraded.id})
    `
    await sql`UPDATE tenants SET last_staff_seen_at = NOW() - INTERVAL '3 days' WHERE id = ${visited.id}`
    await sql`
      UPDATE tenants SET status = 'active'::tenant_status, created_at = NOW() - INTERVAL '400 days'
      WHERE id = ${paying.id}
    `

    await scheduleInactiveFreeDeletion()

    const rows = await sql<{ id: string; scheduled: boolean }[]>`
      SELECT id, scheduled_deletion_at IS NOT NULL AS scheduled FROM tenants
      WHERE id IN (${abandoned.id}, ${visited.id}, ${paying.id}, ${justDowngraded.id})
    `
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.scheduled]))
    expect(byId[abandoned.id]).toBe(true)
    expect(byId[visited.id]).toBe(false)
    expect(byId[paying.id]).toBe(false)
    expect(byId[justDowngraded.id]).toBe(false)
  }, 30_000)
})
