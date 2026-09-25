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

/**
 * Como `seedBooking`, pero con cancha, horario y `starts_at`/`ends_at`
 * explícitos — para los casos de orden de cancha y día operativo, donde el
 * instante físico no se puede derivar de `date` + `time_start` con la
 * aritmética simple que usa `seedBooking`.
 */
async function seedBookingAt(params: {
  tenantId: string
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  startsAt: string
  endsAt: string
  guestName?: string
  guestPhone?: string
}) {
  const sql = getSql()
  const booking = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, guest_name, guest_phone
    )
    VALUES (
      ${params.tenantId}, ${params.courtId}, ${params.date}::date,
      ${params.timeStart}, ${params.timeEnd},
      ${params.startsAt}::timestamptz, ${params.endsAt}::timestamptz,
      'spontaneous', 'confirmed', 900000,
      ${params.guestName ?? 'Juan Invitado'}, ${params.guestPhone ?? null}
    )
    RETURNING id
  `
  return booking[0]!.id
}

/** Cancha con `created_at` explícito, para que el orden entre canchas sea determinístico. */
async function seedCourtAt(tenantId: string, name: string, createdAt: string) {
  const sql = getSql()
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status, created_at)
    VALUES (${tenantId}, ${name}, 10, ${sql.json(PRICING)}, 'online', ${createdAt}::timestamptz)
    RETURNING id
  `
  return court[0]!.id
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

  it('listTenantBookings busca por teléfono con formato distinto, y el nombre sigue andando', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
    const id = await seedBookingAt({
      tenantId: tenant.id,
      courtId,
      date: '2099-08-16',
      timeStart: '10:00',
      timeEnd: '11:00',
      startsAt: '2099-08-16T10:00:00-03:00',
      endsAt: '2099-08-16T11:00:00-03:00',
      guestName: 'Diego',
      guestPhone: '+5491155550000',
    })

    // Formateado distinto al guardado (espacios/guion vs. +/código país):
    // los dos deben normalizar a la misma cola de dígitos.
    const porTelefono = await filas(tenant.id, {
      scope: 'proximas',
      today: TODAY,
      q: '11 5555-0000',
    })
    expect(porTelefono.map((r) => r.id)).toEqual([id])

    // (d) — la búsqueda por nombre no se rompió al sumar la de teléfono.
    const porNombre = await filas(tenant.id, { scope: 'proximas', today: TODAY, q: 'diego' })
    expect(porNombre.map((r) => r.id)).toEqual([id])

    // Menos de 6 dígitos no dispara la rama de teléfono (no debe traer nada).
    const pocosDigitos = await filas(tenant.id, { scope: 'proximas', today: TODAY, q: '55500' })
    expect(pocosDigitos).toHaveLength(0)
  })

  it('listTenantBookings ordena las canchas como la Grilla (created_at, no nombre)', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    const date = '2099-08-17'
    const ids: string[] = []
    for (let n = 1; n <= 10; n++) {
      const courtId = await seedCourtAt(
        tenant.id,
        `Cancha ${n}`,
        `2099-01-01T00:${String(n).padStart(2, '0')}:00Z`,
      )
      const id = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date,
        timeStart: '10:00',
        timeEnd: '11:00',
        startsAt: `${date}T10:00:00-03:00`,
        endsAt: `${date}T11:00:00-03:00`,
        guestName: `Turno ${n}`,
      })
      ids.push(id)
    }

    const rows = await filas(tenant.id, { scope: 'hoy', today: date })
    // Orden de creación (1..10), NUNCA alfabético de texto (que pondría
    // "Cancha 10" entre "Cancha 1" y "Cancha 2").
    expect(rows.map((r) => r.courtName)).toEqual(ids.map((_, i) => `Cancha ${i + 1}`))
  })

  it('listTenantBookings ordena por el instante físico: en un complejo closes_next_day, el turno de 00:00 va después del de las 23:00', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    await sql`UPDATE tenants SET closes_next_day = true WHERE id = ${tenant.id}`
    const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
    const date = '2099-08-18'

    // Turno de las 23:00 del día operativo `date`.
    const idNoche = await seedBookingAt({
      tenantId: tenant.id,
      courtId,
      date,
      timeStart: '23:00',
      timeEnd: '24:00',
      startsAt: `${date}T23:00:00-03:00`,
      endsAt: '2099-08-19T00:00:00-03:00',
      guestName: 'Noche',
    })
    // Turno de las 00:00, MISMO día operativo (closes_next_day), pero
    // físicamente al día siguiente.
    const idMadrugada = await seedBookingAt({
      tenantId: tenant.id,
      courtId,
      date,
      timeStart: '00:00',
      timeEnd: '01:00',
      startsAt: '2099-08-19T00:00:00-03:00',
      endsAt: '2099-08-19T01:00:00-03:00',
      guestName: 'Madrugada',
    })

    const rows = await filas(tenant.id, { scope: 'hoy', today: date })
    expect(rows.map((r) => r.id)).toEqual([idNoche, idMadrugada])
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
