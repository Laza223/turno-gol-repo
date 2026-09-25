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

// "Ahora" fijo de los tests: turnos anclados a esta fecha con starts_at/ends_at
// explícitos a uno y otro lado de este instante.
const NOW = new Date('2099-08-15T20:00:00-03:00')

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
 * explícitos — para los casos de scope por instante físico, orden de cancha y
 * día operativo, donde el instante no se puede derivar de `date` + `time_start`
 * con la aritmética simple que usa `seedBooking`.
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
  status?: string
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
      'spontaneous', ${params.status ?? 'confirmed'}::booking_status, 900000,
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
  it('listTenantBookings returns rows for the tenant with court + guest name + phone', async () => {
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
      guestName: 'Juan Invitado',
      guestPhone: '+5491155550000',
    })

    const rows = await filas(tenant.id, { scope: 'proximos', now: NOW })
    expect(rows.map((r) => r.id)).toEqual([id])
    expect(rows[0]!.courtName).toBe('Cancha 1')
    expect(rows[0]!.guestName).toBe('Juan Invitado')
    expect(rows[0]!.status).toBe('confirmed')
    expect(rows[0]!.depositStatus).toBeDefined()
    expect(rows[0]!.phone).toBe('+5491155550000')
  })

  describe('scope por instante físico (próximos / pasados)', () => {
    it('un turno que empezó y no terminó cae en próximos', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
      const id = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-15',
        timeStart: '19:30',
        timeEnd: '20:30',
        // Arrancó a las 19:30 y termina a las 20:30 — NOW es 20:00: en juego.
        startsAt: '2099-08-15T19:30:00-03:00',
        endsAt: '2099-08-15T20:30:00-03:00',
      })

      const proximos = await filas(tenant.id, { scope: 'proximos', now: NOW })
      expect(proximos.map((r) => r.id)).toEqual([id])
      const pasados = await filas(tenant.id, { scope: 'pasados', now: NOW })
      expect(pasados).toHaveLength(0)
    })

    it('un turno terminado hoy cae en pasados', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
      const id = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-15',
        timeStart: '18:00',
        timeEnd: '19:00',
        startsAt: '2099-08-15T18:00:00-03:00',
        endsAt: '2099-08-15T19:00:00-03:00',
      })

      const pasados = await filas(tenant.id, { scope: 'pasados', now: NOW })
      expect(pasados.map((r) => r.id)).toEqual([id])
      const proximos = await filas(tenant.id, { scope: 'proximos', now: NOW })
      expect(proximos).toHaveLength(0)
    })

    it('un turno que arranca justo cuando termina el corte no cuenta como próximo (ends_at > now estricto)', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
      await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-15',
        timeStart: '19:00',
        timeEnd: '20:00',
        startsAt: '2099-08-15T19:00:00-03:00',
        endsAt: NOW.toISOString(),
      })

      const proximos = await filas(tenant.id, { scope: 'proximos', now: NOW })
      expect(proximos).toHaveLength(0)
      const pasados = await filas(tenant.id, { scope: 'pasados', now: NOW })
      expect(pasados).toHaveLength(1)
    })

    it('orden: próximos por starts_at ASC (lo más cercano primero)', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
      const tarde = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-16',
        timeStart: '10:00',
        timeEnd: '11:00',
        startsAt: '2099-08-16T10:00:00-03:00',
        endsAt: '2099-08-16T11:00:00-03:00',
        guestName: 'Tarde',
      })
      const pronto = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-15',
        timeStart: '21:00',
        timeEnd: '22:00',
        startsAt: '2099-08-15T21:00:00-03:00',
        endsAt: '2099-08-15T22:00:00-03:00',
        guestName: 'Pronto',
      })

      const rows = await filas(tenant.id, { scope: 'proximos', now: NOW })
      expect(rows.map((r) => r.id)).toEqual([pronto, tarde])
    })

    it('orden: pasados por starts_at DESC (lo más reciente primero)', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
      const viejo = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-10',
        timeStart: '10:00',
        timeEnd: '11:00',
        startsAt: '2099-08-10T10:00:00-03:00',
        endsAt: '2099-08-10T11:00:00-03:00',
        guestName: 'Viejo',
      })
      const reciente = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-15',
        timeStart: '18:00',
        timeEnd: '19:00',
        startsAt: '2099-08-15T18:00:00-03:00',
        endsAt: '2099-08-15T19:00:00-03:00',
        guestName: 'Reciente',
      })

      const rows = await filas(tenant.id, { scope: 'pasados', now: NOW })
      expect(rows.map((r) => r.id)).toEqual([reciente, viejo])
    })
  })

  describe('estado: "Todos" sin cancelados/expirados, "canceladas" los agrupa', () => {
    it('listTenantBookings: "Todos" (sin status) deja afuera canceladas y expiradas', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
      const confirmada = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-16',
        timeStart: '10:00',
        timeEnd: '11:00',
        startsAt: '2099-08-16T10:00:00-03:00',
        endsAt: '2099-08-16T11:00:00-03:00',
        guestName: 'Confirmada',
      })
      await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-16',
        timeStart: '11:00',
        timeEnd: '12:00',
        startsAt: '2099-08-16T11:00:00-03:00',
        endsAt: '2099-08-16T12:00:00-03:00',
        guestName: 'Cancelada',
        status: 'canceled_no_refund',
      })
      await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-16',
        timeStart: '12:00',
        timeEnd: '13:00',
        startsAt: '2099-08-16T12:00:00-03:00',
        endsAt: '2099-08-16T13:00:00-03:00',
        guestName: 'Expirada',
        status: 'expired',
      })

      const todos = await filas(tenant.id, { scope: 'proximos', now: NOW })
      expect(todos.map((r) => r.id)).toEqual([confirmada])

      const counts = await withTenantContext(tenant.id, (tx) =>
        countTenantBookingsByStatus(tenant.id, { scope: 'proximos', now: NOW }, tx),
      )
      // El conteo total coherente: la suma de TODOS los status (incluidos
      // cancelado/expirado, que "Todos" resta en `countFor` del lado de la UI,
      // no acá) es 3.
      expect(Object.values(counts).reduce((a, n) => a + n, 0)).toBe(3)
    })

    it('"canceladas" agrupa canceled_refunded + canceled_no_refund + expired', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
      const refunded = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-16',
        timeStart: '10:00',
        timeEnd: '11:00',
        startsAt: '2099-08-16T10:00:00-03:00',
        endsAt: '2099-08-16T11:00:00-03:00',
        status: 'canceled_refunded',
      })
      const noRefund = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-16',
        timeStart: '11:00',
        timeEnd: '12:00',
        startsAt: '2099-08-16T11:00:00-03:00',
        endsAt: '2099-08-16T12:00:00-03:00',
        status: 'canceled_no_refund',
      })
      const expired = await seedBookingAt({
        tenantId: tenant.id,
        courtId,
        date: '2099-08-16',
        timeStart: '12:00',
        timeEnd: '13:00',
        startsAt: '2099-08-16T12:00:00-03:00',
        endsAt: '2099-08-16T13:00:00-03:00',
        status: 'expired',
      })

      const canceladas = await filas(tenant.id, {
        scope: 'proximos',
        now: NOW,
        status: 'canceladas',
      })
      expect(new Set(canceladas.map((r) => r.id))).toEqual(new Set([refunded, noRefund, expired]))
    })
  })

  it('listTenantBookings busca por nombre y por prefijo de id, escapando LIKE', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    // Fecha DESPUÉS de `NOW` (2099-08-15): `seedBooking` no fija `starts_at`
    // explícito, así que tiene que caer del lado "próximos" del corte.
    const id = await seedBooking(tenant.id, '2099-08-20', { guestName: 'María González' })

    const porNombre = await filas(tenant.id, { scope: 'proximos', now: NOW, q: 'gonzá' })
    expect(porNombre.map((r) => r.id)).toEqual([id])

    const porId = await filas(tenant.id, { scope: 'proximos', now: NOW, q: id.slice(0, 8) })
    expect(porId.map((r) => r.id)).toEqual([id])

    // "%" literal no debe matchear todo (escape de metacaracteres LIKE).
    const porPorcentaje = await filas(tenant.id, { scope: 'proximos', now: NOW, q: '%' })
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
      scope: 'proximos',
      now: NOW,
      q: '11 5555-0000',
    })
    expect(porTelefono.map((r) => r.id)).toEqual([id])

    // (d) — la búsqueda por nombre no se rompió al sumar la de teléfono.
    const porNombre = await filas(tenant.id, { scope: 'proximos', now: NOW, q: 'diego' })
    expect(porNombre.map((r) => r.id)).toEqual([id])

    // Menos de 6 dígitos no dispara la rama de teléfono (no debe traer nada).
    const pocosDigitos = await filas(tenant.id, { scope: 'proximos', now: NOW, q: '55500' })
    expect(pocosDigitos).toHaveLength(0)
  })

  it('listTenantBookings ordena las canchas como la Grilla (created_at, no nombre) a igual starts_at', async () => {
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

    const rows = await filas(tenant.id, { scope: 'proximos', now: NOW })
    // Orden de creación de la cancha (1..10), NUNCA alfabético de texto (que
    // pondría "Cancha 10" entre "Cancha 1" y "Cancha 2").
    expect(rows.map((r) => r.courtName)).toEqual(ids.map((_, i) => `Cancha ${i + 1}`))
  })

  it('countTenantBookingsByStatus agrupa por estado dentro del scope', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const tenant = await createTestTenant(sql)
    const courtId = await seedCourtAt(tenant.id, 'Cancha 1', '2099-01-01T00:00:00Z')
    await seedBookingAt({
      tenantId: tenant.id,
      courtId,
      date: '2099-08-16',
      timeStart: '10:00',
      timeEnd: '11:00',
      startsAt: '2099-08-16T10:00:00-03:00',
      endsAt: '2099-08-16T11:00:00-03:00',
    })
    await seedBookingAt({
      tenantId: tenant.id,
      courtId,
      date: '2099-08-16',
      timeStart: '11:00',
      timeEnd: '12:00',
      startsAt: '2099-08-16T11:00:00-03:00',
      endsAt: '2099-08-16T12:00:00-03:00',
      status: 'pending_payment',
    })

    const counts = await withTenantContext(tenant.id, (tx) =>
      countTenantBookingsByStatus(tenant.id, { scope: 'proximos', now: NOW }, tx),
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
    /** N reservas en fechas consecutivas sobre una sola cancha, todas próximas. */
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
        listTenantBookings(tenant.id, { scope: 'proximos', now: NOW }, tx),
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
        listTenantBookings(tenant.id, { scope: 'proximos', now: NOW }, tx, 1),
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

      const p0 = await filas(tenant.id, { scope: 'proximos', now: NOW }, 0)
      const p1 = await filas(tenant.id, { scope: 'proximos', now: NOW }, 1)
      const ids = new Set([...p0, ...p1].map((r) => r.id))

      expect(p0.length + p1.length).toBe(total)
      expect(ids.size).toBe(total)

      const counts = await withTenantContext(tenant.id, (tx) =>
        countTenantBookingsByStatus(tenant.id, { scope: 'proximos', now: NOW }, tx),
      )
      // El número que muestra el chip y lo que se puede recorrer paginando
      // tienen que ser el MISMO número. Esa era exactamente la mentira.
      expect(counts.confirmed).toBe(ids.size)
    })

    it('una página fuera de rango devuelve vacío, no la primera', async () => {
      const sql = getSql()
      await cleanupAll(sql)
      const tenant = await createTestTenant(sql)
      await seedMuchas(tenant.id, 3)

      const lejos = await withTenantContext(tenant.id, (tx) =>
        listTenantBookings(tenant.id, { scope: 'proximos', now: NOW }, tx, 9),
      )

      expect(lejos.rows).toHaveLength(0)
      expect(lejos.hasMore).toBe(false)
    })
  })
})
