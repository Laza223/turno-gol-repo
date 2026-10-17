/**
 * B10 — `/mis-reservas` traía 200 reservas y partía próximos/historial EN JS.
 *
 * El orden es `date DESC`, así que esas 200 siempre contenían todo lo futuro:
 * lo que se perdía era la COLA DEL HISTORIAL. Un jugador de años no llegaba a
 * sus reservas más viejas y nada en pantalla se lo decía. Ahora el corte está
 * en SQL y cada tab pagina por su lado.
 *
 * Y eso trajo una duplicación que hay que vigilar: "Tenés N turnos por jugar"
 * ya no se deriva de las filas en pantalla (parado en Historial no hay ninguna
 * próxima a la vista), así que lo cuenta una query aparte. Si esa query y
 * `countUpcomingPlayable` divergen, el hero miente. Acá se comparan las dos.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Auth boundary mock — hoisted antes de importar la page.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql } from '@/shared/db/client'
import MisReservasPage, { MIS_RESERVAS_PAGE_SIZE } from '@/app/(player)/mis-reservas/page'
import { countUpcomingPlayable } from '@/app/(player)/mis-reservas/upcoming-count'
import { formatDayHeader } from '@/lib/format'
import type { MisReservasBookingRow } from '@/app/(player)/mis-reservas/MisReservasView'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '00:00',
      to: '23:00',
      price: 900000,
    },
  ],
}

type ViewProps = {
  bookings: MisReservasBookingRow[]
  tab: 'proximos' | 'historial'
  page: number
  total: number
  upcomingCount: number
}

/** El día ART de hoy — el mismo cálculo que hace la page. */
function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

/** `date` a N días de hoy (negativo = pasado). */
function dayOffset(n: number): string {
  const base = new Date(`${artToday()}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + n)
  return base.toISOString().slice(0, 10)
}

let playerId: string
let tenantId: string
let courtId: string

async function insertCourt(tid: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tid}, ${'Cancha B10'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

/**
 * N reservas en días consecutivos a partir de `fromOffset`. Las horas rotan por
 * cancha-hora para no chocar con el exclusion constraint.
 */
async function seedBookings(n: number, fromOffset: number, status = 'completed'): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, type, status, price_snapshot, deposit_amount, deposit_status
    )
    SELECT
      ${tenantId}, ${courtId}, ${playerId},
      (${dayOffset(fromOffset)}::date + (i - 1)) AS d,
      '10:00'::time, '11:00'::time,
      ((${dayOffset(fromOffset)}::date + (i - 1)) + '10:00'::time)
        AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ((${dayOffset(fromOffset)}::date + (i - 1)) + '11:00'::time)
        AT TIME ZONE 'America/Argentina/Buenos_Aires',
      'spontaneous', ${status}::booking_status, 900000, 0, 'not_required'
    FROM generate_series(1, ${n}) i
  `
}

const asPlayer = (): AuthUser =>
  ({ type: 'player', id: 'auth-uuid', email: 'p@test.local', playerId }) as AuthUser

async function render(params: { tab?: string; pagina?: string }): Promise<ViewProps> {
  vi.mocked(extractAuthUser).mockResolvedValue(asPlayer())
  // La page devuelve `<RefundDialogProvider><MisReservasView …/></RefundDialogProvider>`:
  // el diálogo de la devolución tiene que vivir POR ENCIMA de la lista, porque
  // la cancelación revalida esta ruta y la tarjeta cancelada —con todo lo que
  // cuelgue de ella— se desmonta. De ahí el `.children` para llegar al view.
  const el = (await MisReservasPage({ searchParams: Promise.resolve(params) })) as {
    props: { children: { props: ViewProps } }
  }
  return el.props.children.props
}

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)

  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  courtId = await insertCourt(tenant.id)
  const player = await createTestPlayer(sql)
  playerId = player.id
  await linkPlayerToTenant(sql, tenant.id, player.id)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('/mis-reservas — paginación por tab (B10)', () => {
  it('el historial largo deja de perder la cola', async () => {
    // El escenario exacto del defecto: más historial del que entra en una
    // página. Antes esto se comía las más viejas sin decir nada.
    await seedBookings(MIS_RESERVAS_PAGE_SIZE + 4, -(MIS_RESERVAS_PAGE_SIZE + 10))

    const p0 = await render({ tab: 'historial' })
    expect(p0.bookings).toHaveLength(MIS_RESERVAS_PAGE_SIZE)
    expect(p0.total).toBe(MIS_RESERVAS_PAGE_SIZE + 4)

    const p1 = await render({ tab: 'historial', pagina: '2' })
    expect(p1.bookings).toHaveLength(4)
    // El total es el MISMO en las dos páginas: viene de la misma ventana
    // (`COUNT(*) OVER()`), no de cuántas filas trajo esta página puntual.
    expect(p1.total).toBe(MIS_RESERVAS_PAGE_SIZE + 4)

    // Ni se pisan ni se saltean.
    const ids = new Set([...p0.bookings, ...p1.bookings].map((b) => b.id))
    expect(ids.size).toBe(MIS_RESERVAS_PAGE_SIZE + 4)
  })

  it('cada tab ve SOLO lo suyo, y el corte lo hace SQL', async () => {
    await seedBookings(3, 5, 'confirmed') // futuras
    await seedBookings(2, -3, 'completed') // pasadas

    const hoy = artToday()
    const proximos = await render({ tab: 'proximos' })
    const historial = await render({ tab: 'historial' })

    expect(proximos.bookings.length).toBeGreaterThan(0)
    expect(proximos.bookings.every((b) => b.date >= hoy)).toBe(true)
    expect(historial.bookings.every((b) => b.date < hoy)).toBe(true)
  })

  it('"turnos por jugar" da lo MISMO que countUpcomingPlayable', async () => {
    // La duplicación que introdujo el fix: el número salía de las filas y ahora
    // sale de su propia query. Si divergen, el hero miente.
    await seedBookings(3, 20, 'confirmed')
    await seedBookings(2, 30, 'pending_payment')
    await seedBookings(4, 40, 'canceled_no_refund') // no cuentan

    const sql = getSql()
    const todas = await sql<{ date: string; status: string; ends_at: Date }[]>`
      SELECT date::text AS date, status, ends_at FROM bookings WHERE player_id = ${playerId}
    `
    const esperado = countUpcomingPlayable([...todas], artToday(), Date.now())

    const proximos = await render({ tab: 'proximos' })
    const historial = await render({ tab: 'historial' })

    expect(proximos.upcomingCount).toBe(esperado)
    // Y el número no cambia por estar parado en el otro tab: ese es justo el
    // caso que rompería si se derivara de las filas en pantalla.
    expect(historial.upcomingCount).toBe(esperado)
    expect(esperado).toBeGreaterThan(0)
  })

  it('un ?pagina basura cae a la primera en vez de romper', async () => {
    const basura = await render({ tab: 'historial', pagina: 'seis' })
    const negativa = await render({ tab: 'historial', pagina: '-4' })
    const primera = await render({ tab: 'historial' })

    expect(basura.page).toBe(0)
    expect(negativa.page).toBe(0)
    expect(basura.bookings.map((b) => b.id)).toEqual(primera.bookings.map((b) => b.id))
  })
})

describe('/mis-reservas — orden y datos de la próxima (PR 2.4a)', () => {
  it('Próximos va de la más cercana a la más lejana; Historial, de la más nueva a la más vieja', async () => {
    // Sembradas desordenadas a propósito: el orden lo tiene que poner la query.
    await seedBookings(1, 70, 'confirmed')
    await seedBookings(1, 50, 'confirmed')
    await seedBookings(1, 60, 'confirmed')
    await seedBookings(1, -80, 'completed')
    await seedBookings(1, -60, 'completed')
    await seedBookings(1, -70, 'completed')

    const proximos = await render({ tab: 'proximos' })
    // Los terminados de hoy van al final (ver la page): el orden ASC vale para el resto.
    const fechas = proximos.bookings.filter((b) => !b.ended).map((b) => `${b.date} ${b.time_start}`)
    expect(fechas.length).toBeGreaterThan(3)
    expect(fechas).toEqual([...fechas].sort())

    const historial = await render({ tab: 'historial' })
    const pasadas = historial.bookings.map((b) => `${b.date} ${b.time_start}`)
    expect(pasadas.length).toBeGreaterThan(3)
    expect(pasadas).toEqual([...pasadas].sort().reverse())
  })

  it('trae formato, dirección y quién canceló; `ended` sale de ends_at contra ahora', async () => {
    const sql = getSql()
    const hoy = artToday()
    const other = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, format, pricing, status)
      VALUES (${tenantId}, ${'Cancha 24A'}, ${14}, ${7}, ${sql.json(PRICING)}, 'online')
      RETURNING id
    `
    const courtId24a = other[0]!.id
    // `time_start`/`time_end` son display: lo que decide si terminó es `ends_at`.
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES
        (${tenantId}, ${courtId24a}, ${playerId}, ${hoy}, '10:00', '11:00',
         now() - interval '3 hours', now() - interval '2 hours',
         'spontaneous', 'confirmed', 900000, 0, 'not_required'),
        (${tenantId}, ${courtId24a}, ${playerId}, ${hoy}, '12:00', '13:00',
         now() + interval '2 hours', now() + interval '3 hours',
         'spontaneous', 'confirmed', 900000, 0, 'not_required')
    `
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status, canceled_by
      ) VALUES
        (${tenantId}, ${courtId24a}, ${playerId}, ${dayOffset(-1)}, '10:00', '11:00',
         now() - interval '1 day', now() - interval '1 day' + interval '1 hour',
         'spontaneous', 'canceled_no_refund', 900000, 0, 'not_required', 'admin')
    `

    const proximos = await render({ tab: 'proximos' })
    const deHoy = proximos.bookings.filter((b) => b.date === hoy && b.court_name === 'Cancha 24A')
    // El terminado de hoy (10:00) va DESPUÉS del que todavía se juega (12:00): no puede ser "la próxima".
    expect(deHoy.map((b) => [b.time_start.slice(0, 5), b.ended])).toEqual([
      ['12:00', false],
      ['10:00', true],
    ])
    expect(deHoy[1]!.court_format).toBe(7)
    // El share es solo de un turno que todavía no terminó.
    expect(deHoy[1]!.share_href).toBeNull()
    expect(deHoy[0]!.share_href).toContain('https://wa.me/?text=')
    // En toda la lista: ningún terminado antes de uno que se juega, y no cuentan en "por jugar".
    const primerTerminado = proximos.bookings.findIndex((b) => b.ended)
    expect(primerTerminado).toBeGreaterThan(0)
    expect(proximos.bookings.slice(primerTerminado).every((b) => b.ended)).toBe(true)
    const vivos = proximos.bookings.filter((b) => !b.ended).length
    expect(proximos.upcomingCount).toBeGreaterThanOrEqual(vivos)
    const [{ n }] = await sql<{ n: string }[]>`
      SELECT COUNT(*) AS n FROM bookings
      WHERE player_id = ${playerId} AND date >= ${hoy}::date AND ends_at > now()
        AND status IN ('confirmed', 'pending_payment')
    `
    expect(proximos.upcomingCount).toBe(Number(n))

    const historial = await render({ tab: 'historial' })
    const cancelada = historial.bookings.find((b) => b.date === dayOffset(-1))
    expect(cancelada?.canceled_by).toBe('admin')
    expect(cancelada?.status).toBe('canceled_no_refund')
  })
})

describe('/mis-reservas — día físico (ronda 2)', () => {
  it('`starts_on` es el día calendario del instante, no el día operativo (complejo que cierra pasada la medianoche)', async () => {
    const sql = getSql()
    const hoy = artToday()
    const mañana = dayOffset(1)
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${tenantId}, ${'Cancha madrugada'}, ${10}, ${sql.json(PRICING)}, 'online')
      RETURNING id
    `
    // Día operativo de hoy, turno de las 00:00: físicamente es mañana a las 00:00 ART.
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES (
        ${tenantId}, ${c!.id}, ${playerId}, ${hoy}, '00:00', '01:00',
        ((${mañana}::date + '00:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        ((${mañana}::date + '01:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        'spontaneous', 'confirmed', 900000, 0, 'not_required'
      )
    `
    const fila = (await render({ tab: 'proximos' })).bookings.find(
      (b) => b.court_name === 'Cancha madrugada',
    )
    expect(fila?.date).toBe(hoy)
    expect(fila?.starts_on).toBe(mañana)
    // El mensaje de "Avisarle al grupo" dice el día en que se juega, no el operativo.
    const texto = new URL(fila!.share_href!).searchParams.get('text') ?? ''
    expect(texto).toContain(`Jugamos el ${formatDayHeader(mañana)}`)
  })

  it('un turno en juego cuyo día operativo ya es ayer sigue en Próximos y cuenta como por jugar', async () => {
    // Complejo que cierra pasada la medianoche: a las 00:30 se está jugando el turno de 00:00 del
    // día operativo de ayer. Por `date` caería en Historial; por el instante físico, no terminó.
    const sql = getSql()
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${tenantId}, ${'Cancha en juego'}, ${10}, ${sql.json(PRICING)}, 'online')
      RETURNING id
    `
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES (
        ${tenantId}, ${c!.id}, ${playerId}, ${dayOffset(-1)}, '00:00', '01:00',
        now() - interval '30 minutes', now() + interval '30 minutes',
        'spontaneous', 'confirmed', 900000, 0, 'not_required'
      )
    `
    const proximos = await render({ tab: 'proximos' })
    const historial = await render({ tab: 'historial' })
    const enJuego = (r: ViewProps) => r.bookings.some((b) => b.court_name === 'Cancha en juego')

    expect(enJuego(proximos)).toBe(true)
    expect(enJuego(historial)).toBe(false)

    const todas = await sql<{ date: string; status: string; ends_at: Date }[]>`
      SELECT date::text AS date, status, ends_at FROM bookings WHERE player_id = ${playerId}
    `
    expect(proximos.upcomingCount).toBe(countUpcomingPlayable([...todas], artToday(), Date.now()))
    expect(proximos.upcomingCount).toBeGreaterThan(0)
  })
})

describe('/mis-reservas — precios ocultos (PR 2.4a)', () => {
  it('con `hide_public_prices` el monto del turno no sale de la page; la seña propia sí', async () => {
    const sql = getSql()
    const [hidden] = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${tenantId}, ${'Cancha precios'}, ${10}, ${sql.json(PRICING)}, 'online')
      RETURNING id
    `
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status
      ) VALUES (
        ${tenantId}, ${hidden!.id}, ${playerId}, ${dayOffset(2)}, '15:00', '16:00',
        ((${dayOffset(2)}::date + '15:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        ((${dayOffset(2)}::date + '16:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        'spontaneous', 'confirmed', 777700, 233100, 'paid'
      )
    `
    const original = await sql<{ settings: Record<string, unknown> }[]>`
      SELECT settings FROM tenants WHERE id = ${tenantId}
    `
    const buscar = async () =>
      (await render({ tab: 'proximos' })).bookings.find((b) => b.court_name === 'Cancha precios')

    try {
      // Visibles: el monto viaja.
      expect((await buscar())?.price_snapshot).toBe(777700)

      await sql`
        UPDATE tenants SET settings = settings || '{"hide_public_prices": true}'::jsonb
        WHERE id = ${tenantId}
      `
      const oculto = await buscar()
      expect(oculto?.price_snapshot).toBeNull()
      // La seña propia no es un precio del complejo: sigue a la vista.
      expect(oculto?.deposit_amount).toBe(233100)
      expect(oculto?.deposit_status).toBe('paid')
    } finally {
      await sql`UPDATE tenants SET settings = ${sql.json(original[0]!.settings as never)} WHERE id = ${tenantId}`
    }
  })
})
