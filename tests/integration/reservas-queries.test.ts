import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  countTenantBookingsByStatus,
  getBookingDetail,
  listTenantBookings,
} from '@/app/(admin)/reservas/queries'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = { rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 900000, '120': 1700000 } }] }

// Los seeds usan fechas 2099 (siempre futuras): con today fijo anterior, todo
// cae en scope 'proximas'.
const TODAY = '2099-08-01'

async function seedBooking(tenantId: string, date: string, overrides: { status?: string; guestName?: string } = {}) {
  const sql = getSql()
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, 'Cancha 1', 10, ${sql.json(PRICING)}, 'online') RETURNING id
  `
  const booking = await sql<{ id: string }[]>`
    INSERT INTO bookings (tenant_id, court_id, date, time_start, time_end, type, status, price_snapshot, guest_name)
    VALUES (${tenantId}, ${court[0]!.id}, ${date}::date, '10:00', '11:00', 'spontaneous',
            ${overrides.status ?? 'confirmed'}::booking_status, 900000, ${overrides.guestName ?? 'Juan Invitado'})
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

    const rows = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY }, tx),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.courtName).toBe('Cancha 1')
    expect(rows[0]!.guestName).toBe('Juan Invitado')
    expect(rows[0]!.status).toBe('confirmed')
    expect(rows[0]!.depositStatus).toBeDefined()
  })

  it('listTenantBookings respects the date scope (hoy / proximas / historial)', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-10')

    const hoy = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'hoy', today: '2099-08-10' }, tx),
    )
    expect(hoy).toHaveLength(1)
    const historial = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'historial', today: '2099-08-11' }, tx),
    )
    expect(historial).toHaveLength(1)
    const proximasVacio = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'proximas', today: '2099-08-10' }, tx),
    )
    expect(proximasVacio).toHaveLength(0)
  })

  it('listTenantBookings filters by status, including the virtual "canceladas"', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-11')
    await seedBooking(tenant.id, '2099-08-12', { status: 'canceled_no_refund' })

    const confirmed = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY, status: 'confirmed' }, tx),
    )
    expect(confirmed).toHaveLength(1)
    const canceladas = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY, status: 'canceladas' }, tx),
    )
    expect(canceladas).toHaveLength(1)
    expect(canceladas[0]!.status).toBe('canceled_no_refund')
  })

  it('listTenantBookings busca por nombre y por prefijo de id, escapando LIKE', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    const id = await seedBooking(tenant.id, '2099-08-13', { guestName: 'María González' })

    const porNombre = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY, q: 'gonzá' }, tx),
    )
    expect(porNombre.map((r) => r.id)).toEqual([id])

    const porId = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY, q: id.slice(0, 8) }, tx),
    )
    expect(porId.map((r) => r.id)).toEqual([id])

    // "%" literal no debe matchear todo (escape de metacaracteres LIKE).
    const porPorcentaje = await withTenantContext(tenant.id, (tx) =>
      listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY, q: '%' }, tx),
    )
    expect(porPorcentaje).toHaveLength(0)
  })

  it('countTenantBookingsByStatus agrupa por estado dentro del scope', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-14')
    await seedBooking(tenant.id, '2099-08-14', { status: 'pending_payment' })
    await seedBooking(tenant.id, '2099-08-15', { status: 'no_show' })

    const counts = await withTenantContext(tenant.id, (tx) =>
      countTenantBookingsByStatus(tenant.id, { scope: 'hoy', today: '2099-08-14' }, tx),
    )
    expect(counts).toEqual({ confirmed: 1, pending_payment: 1 })
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
