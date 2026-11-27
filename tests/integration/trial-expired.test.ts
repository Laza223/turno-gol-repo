import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { OnlineBookingNotAvailableError } from '@/modules/bookings/booking.errors'
import { InvalidTransitionError } from '@/modules/billing/billing.errors'
import { transitionToActiveFromAny, transitionToExpired } from '@/modules/billing/lifecycle.service'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { cleanupAll, createTestPlayer, createTestTenant, ensureRoles } from '../helpers/tenant'
import { getOrCreatePlanId, insertSubscription } from '../helpers/factories'

/**
 * Fin del freemium (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md) contra Postgres
 * real: transiciones a y desde `trial_expired`, y el alta online que lo rechaza.
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

async function statusesOf(tenantId: string): Promise<{ status: string; sub: string }> {
  const [row] = await getSql()<{ status: string; sub: string }[]>`
    SELECT t.status::text AS status, s.status::text AS sub
    FROM tenants t JOIN tenant_subscriptions s ON s.tenant_id = t.id WHERE t.id = ${tenantId}
  `
  return row!
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

describe('transiciones de trial_expired', () => {
  it('trialing → trial_expired al vencer la prueba, y trial_expired → active al pagar', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId: await getOrCreatePlanId(sql) })

    await withTenantContext(tenant.id, (tx) => transitionToExpired(tenant.id, 'trial_expired', tx))
    expect(await statusesOf(tenant.id)).toEqual({ status: 'trial_expired', sub: 'trial_expired' })

    const start = new Date()
    const end = new Date(start.getTime() + 30 * 86_400_000)
    await withTenantContext(tenant.id, (tx) => transitionToActiveFromAny(tenant.id, start, end, tx))
    expect(await statusesOf(tenant.id)).toEqual({ status: 'active', sub: 'active' })
  })

  it('el alias viejo `free` también vuelve a active al pagar', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId: await getOrCreatePlanId(sql) })
    await sql`UPDATE tenants SET status = 'free'::tenant_status WHERE id = ${tenant.id}`
    await sql`UPDATE tenant_subscriptions SET status = 'free'::subscription_status WHERE tenant_id = ${tenant.id}`

    const start = new Date()
    await withTenantContext(tenant.id, (tx) =>
      transitionToActiveFromAny(tenant.id, start, new Date(start.getTime() + 30 * 86_400_000), tx),
    )
    expect(await statusesOf(tenant.id)).toEqual({ status: 'active', sub: 'active' })
  })

  it('el origen manda: una suscripción activa no pasa a trial_expired por "prueba vencida"', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await insertSubscription(sql, {
      tenantId: tenant.id,
      planId: await getOrCreatePlanId(sql),
      status: 'active',
    })
    await sql`UPDATE tenants SET status = 'active'::tenant_status WHERE id = ${tenant.id}`

    await expect(
      withTenantContext(tenant.id, (tx) => transitionToExpired(tenant.id, 'trial_expired', tx)),
    ).rejects.toBeInstanceOf(InvalidTransitionError)
    expect((await statusesOf(tenant.id)).status).toBe('active')
  })

  it('limpia el borrado agendado y deja el audit `tenant.expired` con el origen', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId: await getOrCreatePlanId(sql) })
    await sql`UPDATE tenants SET scheduled_deletion_at = NOW() + INTERVAL '10 days' WHERE id = ${tenant.id}`

    await withTenantContext(tenant.id, (tx) => transitionToExpired(tenant.id, 'trial_expired', tx))

    const [row] = await sql<{ scheduled: boolean }[]>`
      SELECT scheduled_deletion_at IS NOT NULL AS scheduled FROM tenants WHERE id = ${tenant.id}
    `
    expect(row!.scheduled).toBe(false)
    const audit = await sql<{ metadata: { reason: string } }[]>`
      SELECT metadata FROM audit_logs WHERE action = 'tenant.expired' AND resource_id = ${tenant.id}
    `
    expect(audit).toHaveLength(1)
    expect(audit[0]!.metadata.reason).toBe('trial_expired')
  })
})

describe('alta online con el plan no activo', () => {
  it('trial_expired rechaza la reserva online con un error tipado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'trial_expired'::tenant_status WHERE id = ${tenant.id}`
    const court = await insertCourt(tenant.id, 'Cancha 1')
    const player = await createTestPlayer(sql)

    const err = await book(tenant.id, player.id, court, '2027-04-05').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OnlineBookingNotAvailableError)
  }, 30_000)

  it('el alias viejo `free` también la rechaza', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'free'::tenant_status WHERE id = ${tenant.id}`
    const court = await insertCourt(tenant.id, 'Cancha 1')
    const player = await createTestPlayer(sql)

    const err = await book(tenant.id, player.id, court, '2027-04-05').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OnlineBookingNotAvailableError)
  }, 30_000)

  it('un complejo activo la acepta', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'active'::tenant_status WHERE id = ${tenant.id}`
    const court = await insertCourt(tenant.id, 'Cancha 1')
    const player = await createTestPlayer(sql)

    await expect(book(tenant.id, player.id, court, '2027-04-05')).resolves.toBeTruthy()
  }, 30_000)
})
