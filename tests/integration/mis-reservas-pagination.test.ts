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
  hasMore: boolean
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
  const el = (await MisReservasPage({ searchParams: Promise.resolve(params) })) as {
    props: ViewProps
  }
  return el.props
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
    expect(p0.hasMore).toBe(true)

    const p1 = await render({ tab: 'historial', pagina: '2' })
    expect(p1.bookings).toHaveLength(4)
    expect(p1.hasMore).toBe(false)

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
    const todas = await sql<{ date: string; status: string }[]>`
      SELECT date::text AS date, status FROM bookings WHERE player_id = ${playerId}
    `
    const esperado = countUpcomingPlayable([...todas], artToday())

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
