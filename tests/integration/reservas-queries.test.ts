import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { getBookingDetail, listTenantBookings } from '@/app/(admin)/reservas/queries'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = { rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 900000, '120': 1700000 } }] }

async function seedBooking(tenantId: string, date: string) {
  const sql = getSql()
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, 'Cancha 1', 10, ${sql.json(PRICING)}, 'online') RETURNING id
  `
  const booking = await sql<{ id: string }[]>`
    INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end, type, status, price_snapshot, guest_name)
    VALUES (${tenantId}, ${court[0]!.id}, ${date}::date, '10:00', '11:00', 'spontaneous', 'confirmed', 900000, 'Juan Invitado')
    RETURNING id
  `
  return booking[0]!.id
}

beforeAll(async () => { await ensureRoles() })
afterAll(async () => { await cleanupAll(); await closeSql() })

describe('reservas queries', () => {
  it('listTenantBookings returns rows for the tenant with court + guest name', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-10')

    const rows = await withTenantContext(tenant.id, (tx) => listTenantBookings(tenant.id, {}, tx))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.courtName).toBe('Cancha 1')
    expect(rows[0]!.guestName).toBe('Juan Invitado')
    expect(rows[0]!.status).toBe('confirmed')
  })

  it('listTenantBookings filters by status', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-11')

    const confirmed = await withTenantContext(tenant.id, (tx) => listTenantBookings(tenant.id, { status: 'confirmed' }, tx))
    expect(confirmed).toHaveLength(1)
    const canceled = await withTenantContext(tenant.id, (tx) => listTenantBookings(tenant.id, { status: 'canceled_no_refund' }, tx))
    expect(canceled).toHaveLength(0)
  })

  it('getBookingDetail returns the booking or null', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    const id = await seedBooking(tenant.id, '2099-08-12')

    const detail = await withTenantContext(tenant.id, (tx) => getBookingDetail(tenant.id, id, tx))
    expect(detail).not.toBeNull()
    expect(detail!.id).toBe(id)
    expect(detail!.depositStatus).toBeDefined()

    const missing = await withTenantContext(tenant.id, (tx) =>
      getBookingDetail(tenant.id, '00000000-0000-0000-0000-000000000000', tx),
    )
    expect(missing).toBeNull()
  })
})
