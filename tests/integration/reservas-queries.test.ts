import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  countTenantBookingsByStatus,
  getBookingDetail,
  listTenantBookings,
  RESERVAS_PAGE_SIZE,
  type ReservaListFilters,
  type ReservaListRow,
} from '@/app/(admin)/reservas/queries'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

/** Solo las filas de una página — lo que asertan casi todos los casos de acá. */
async function filas(
  tenantId: string,
  filters: ReservaListFilters,
  page = 0,
): Promise<ReservaListRow[]> {
  const { rows } = await withTenantContext(tenantId, (tx) =>
    listTenantBookings(tenantId, filters, tx, page),
  )
  return rows
}

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 900000,
    },
  ],
}

// Los seeds usan fechas 2099 (siempre futuras): con today fijo anterior, todo
// cae en scope 'proximas'.
const TODAY = '2099-08-01'

async function seedBooking(
  tenantId: string,
  date: string,
  overrides: { status?: string; guestName?: string } = {},
) {
  const sql = getSql()
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, 'Cancha 1', 10, ${sql.json(PRICING)}, 'online') RETURNING id
  `
  const booking = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, guest_name
    )
    VALUES (
      ${tenantId}, ${court[0]!.id}, ${date}::date, '10:00', '11:00',
      (${date}::date + '10:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${date}::date + '11:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      'spontaneous',
      ${overrides.status ?? 'confirmed'}::booking_status, 900000, ${overrides.guestName ?? 'Juan Invitado'}
    )
    RETURNING id
  `
  return booking[0]!.id
}

beforeAll(async () => {
  await ensureRoles()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('reservas queries', () => {
  it('listTenantBookings returns rows for the tenant with court + guest name', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-10')

    const rows = await filas(tenant.id, { scope: 'proximas', today: TODAY })
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

    const hoy = await filas(tenant.id, { scope: 'hoy', today: '2099-08-10' })
    expect(hoy).toHaveLength(1)
    const historial = await filas(tenant.id, { scope: 'historial', today: '2099-08-11' })
    expect(historial).toHaveLength(1)
    const proximasVacio = await filas(tenant.id, { scope: 'proximas', today: '2099-08-10' })
    expect(proximasVacio).toHaveLength(0)
  })

  it('listTenantBookings filters by status, including the virtual "canceladas"', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await seedBooking(tenant.id, '2099-08-11')
    await seedBooking(tenant.id, '2099-08-12', { status: 'canceled_no_refund' })

    const confirmed = await filas(tenant.id, {
      scope: 'proximas',
      today: TODAY,
      status: 'confirmed',
    })
    expect(confirmed).toHaveLength(1)
    const canceladas = await filas(tenant.id, {
      scope: 'proximas',
      today: TODAY,
      status: 'canceladas',
    })
    expect(canceladas).toHaveLength(1)
    expect(canceladas[0]!.status).toBe('canceled_no_refund')
  })

  it('listTenantBookings busca por nombre y por prefijo de id, escapando LIKE', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    const id = await seedBooking(tenant.id, '2099-08-13', { guestName: 'María González' })

    const porNombre = await filas(tenant.id, { scope: 'proximas', today: TODAY, q: 'gonzá' })
    expect(porNombre.map((r) => r.id)).toEqual([id])

    const porId = await filas(tenant.id, { scope: 'proximas', today: TODAY, q: id.slice(0, 8) })
    expect(porId.map((r) => r.id)).toEqual([id])

    // "%" literal no debe matchear todo (escape de metacaracteres LIKE).
    const porPorcentaje = await filas(tenant.id, { scope: 'proximas', today: TODAY, q: '%' })
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

  /**
   * B10 — el defecto no era el techo de 200 sino el silencio: el COUNT de las
   * píldoras no tiene techo, así que la UI podía decir "740" y listar 200 sin
   * avisar y sin forma de llegar al resto.
   */
  describe('paginación', () => {
    /** N reservas en fechas consecutivas sobre una sola cancha. */
    async function seedMuchas(tenantId: string, n: number): Promise<void> {
      const sql = getSql()
      const court = await sql<{ id: string }[]>`
        INSERT INTO courts (tenant_id, name, capacity, pricing, status)
        VALUES (${tenantId}, 'Cancha bulk', 10, ${sql.json(PRICING)}, 'online') RETURNING id
      `
      await sql`
        INSERT INTO bookings (
          tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
          type, status, price_snapshot, guest_name
        )
        SELECT
          ${tenantId}, ${court[0]!.id}, d::date, '10:00', '11:00',
          (d::date + '10:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
          (d::date + '11:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
          'spontaneous', 'confirmed', 900000, 'Bulk ' || d::text
        FROM generate_series(
          '2099-09-01'::date, '2099-09-01'::date + ${n - 1}::int, '1 day'
        ) d
      `
    }

    it('devuelve una página completa y avisa que hay más', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      await seedMuchas(tenant.id, RESERVAS_PAGE_SIZE + 5)

      const primera = await withTenantContext(tenant.id, (tx) =>
        listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY }, tx),
      )

      // Exactamente el tamaño de página: el `LIMIT n+1` es para DETECTAR, no
      // para devolver una fila de más.
      expect(primera.rows).toHaveLength(RESERVAS_PAGE_SIZE)
      expect(primera.hasMore).toBe(true)
    })

    it('la última página no miente diciendo que hay más', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      await seedMuchas(tenant.id, RESERVAS_PAGE_SIZE + 5)

      const segunda = await withTenantContext(tenant.id, (tx) =>
        listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY }, tx, 1),
      )

      expect(segunda.rows).toHaveLength(5)
      expect(segunda.hasMore).toBe(false)
    })

    it('las páginas no se pisan ni se saltean filas', async () => {
      // El modo de falla del offset mal calculado: repetir la fila del borde o
      // comerse una. Se ve comparando el conjunto completo contra el COUNT.
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const total = RESERVAS_PAGE_SIZE + 5
      await seedMuchas(tenant.id, total)

      const p0 = await filas(tenant.id, { scope: 'proximas', today: TODAY }, 0)
      const p1 = await filas(tenant.id, { scope: 'proximas', today: TODAY }, 1)
      const ids = new Set([...p0, ...p1].map((r) => r.id))

      expect(p0.length + p1.length).toBe(total)
      expect(ids.size).toBe(total)

      const counts = await withTenantContext(tenant.id, (tx) =>
        countTenantBookingsByStatus(tenant.id, { scope: 'proximas', today: TODAY }, tx),
      )
      // El número que muestra la píldora y lo que se puede recorrer paginando
      // tienen que ser el MISMO número. Esa era exactamente la mentira.
      expect(counts.confirmed).toBe(ids.size)
    })

    it('una página fuera de rango devuelve vacío, no la primera', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      await seedMuchas(tenant.id, 3)

      const lejos = await withTenantContext(tenant.id, (tx) =>
        listTenantBookings(tenant.id, { scope: 'proximas', today: TODAY }, tx, 9),
      )

      expect(lejos.rows).toHaveLength(0)
      expect(lejos.hasMore).toBe(false)
    })
  })
})
