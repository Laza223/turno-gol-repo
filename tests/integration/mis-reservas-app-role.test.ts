/**
 * La query de `/mis-reservas` medida con el ROL REAL de la app (`turnogol_app`, RLS enforced), por
 * el mismo envoltorio que usa producción (`withPlayerContext`).
 *
 * Por qué existe, además de `mis-reservas-pagination.test.ts`: ese archivo corre con el
 * superusuario de los tests (BYPASSRLS) y no puede probar que la query, ahora con JOIN a `tenants`
 * (dirección, ciudad, coordenadas) y `courts` (formato) de OTROS complejos, siga trayendo solo las
 * reservas del jugador y que `courts`/`tenants` se lean bien bajo RLS.
 *
 * Mismo arnés que `isolation-app-role.test.ts`: LOGIN del rol mientras dura el archivo (se devuelve
 * el verifier original en el `afterAll`) y siembra SIEMPRE por el pool admin.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql, getWorkerSql, withPlayerContext } from '@/shared/db/client'
import MisReservasPage from '@/app/(player)/mis-reservas/page'
import type { MisReservasBookingRow } from '@/app/(player)/mis-reservas/MisReservasView'
import { adminSql } from '../helpers/admin-db'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { insertBooking } from '../helpers/factories'
import { sql as drizzleSql } from 'drizzle-orm'

const APP_TEST_PASSWORD = 'turnogol_app_mis_reservas'
const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

let prevAppUrl: string | undefined
let prevAdminUrl: string | undefined
let prevPoolMax: string | undefined
let prevAppVerifier: string | null = null
let appCouldLoginBefore = false

let p1: string
let p2: string
const ids: Record<string, string> = {}

async function insertCourt(
  su: ReturnType<typeof adminSql>,
  tenantId: string,
  name: string,
  format: number,
): Promise<string> {
  const rows = await su<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, format, pricing, status)
    VALUES (${tenantId}, ${name}, ${format * 2}, ${format}, ${su.json({ rules: [] })}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

beforeAll(async () => {
  getSql()
  getWorkerSql()
  await closeSql()
  const original = process.env.DATABASE_URL ?? DEFAULT_URL
  prevAdminUrl = process.env.TEST_ADMIN_DATABASE_URL
  process.env.TEST_ADMIN_DATABASE_URL = original
  prevPoolMax = process.env.DATABASE_POOL_MAX
  process.env.DATABASE_POOL_MAX = '1'

  const su = adminSql()
  const before = (
    await su<Array<{ can_login: boolean; verifier: string | null }>>`
      SELECT rolcanlogin AS can_login, rolpassword AS verifier
      FROM pg_authid WHERE rolname = 'turnogol_app'
    `
  )[0]
  appCouldLoginBefore = before?.can_login === true
  prevAppVerifier = before?.verifier ?? null
  await su.unsafe(`ALTER ROLE turnogol_app LOGIN PASSWORD '${APP_TEST_PASSWORD}'`)

  prevAppUrl = process.env.DATABASE_URL
  const appUrl = new URL(original)
  appUrl.username = 'turnogol_app'
  appUrl.password = APP_TEST_PASSWORD
  process.env.DATABASE_URL = appUrl.toString()

  // Siembra por el pool admin: dos complejos (con dirección y cancha de formato distinto) y dos
  // jugadores. p1 reserva en los dos complejos; p2, en el primero.
  await cleanupAll(su)
  const tA = await createTestTenant(su)
  const tB = await createTestTenant(su)
  await su`UPDATE tenants SET address = 'Calle A 111', city = 'Rosario' WHERE id = ${tA.id}`
  await su`UPDATE tenants SET address = 'Calle B 222', city = 'Funes' WHERE id = ${tB.id}`
  const cA = await insertCourt(su, tA.id, 'Cancha A', 5)
  const cB = await insertCourt(su, tB.id, 'Cancha B', 11)
  p1 = (await createTestPlayer(su)).id
  p2 = (await createTestPlayer(su)).id
  await linkPlayerToTenant(su, tA.id, p1)
  await linkPlayerToTenant(su, tB.id, p1)
  await linkPlayerToTenant(su, tA.id, p2)
  ids.p1A = await insertBooking(su, {
    tenantId: tA.id,
    courtId: cA,
    playerId: p1,
    timeStart: '10:00',
    timeEnd: '11:00',
    status: 'confirmed',
  })
  ids.p1B = await insertBooking(su, {
    tenantId: tB.id,
    courtId: cB,
    playerId: p1,
    timeStart: '12:00',
    timeEnd: '13:00',
    status: 'confirmed',
  })
  ids.p2A = await insertBooking(su, {
    tenantId: tA.id,
    courtId: cA,
    playerId: p2,
    timeStart: '16:00',
    timeEnd: '17:00',
    status: 'confirmed',
  })
}, 60_000)

afterAll(async () => {
  await closeSql()
  const su = adminSql()
  await cleanupAll(su)
  if (appCouldLoginBefore && prevAppVerifier) {
    await su.unsafe(
      `ALTER ROLE turnogol_app LOGIN PASSWORD '${prevAppVerifier.replaceAll("'", "''")}'`,
    )
  } else {
    await su.unsafe('ALTER ROLE turnogol_app NOLOGIN')
    await su.unsafe('ALTER ROLE turnogol_app PASSWORD NULL')
  }
  if (prevAppUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = prevAppUrl
  if (prevAdminUrl === undefined) delete process.env.TEST_ADMIN_DATABASE_URL
  else process.env.TEST_ADMIN_DATABASE_URL = prevAdminUrl
  if (prevPoolMax === undefined) delete process.env.DATABASE_POOL_MAX
  else process.env.DATABASE_POOL_MAX = prevPoolMax
}, 60_000)

async function renderFor(playerId: string): Promise<MisReservasBookingRow[]> {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'player',
    id: 'auth-uuid',
    email: 'p@test.local',
    playerId,
  } as AuthUser)
  const el = (await MisReservasPage({ searchParams: Promise.resolve({}) })) as {
    props: { children: { props: { bookings: MisReservasBookingRow[] } } }
  }
  return el.props.children.props.bookings
}

describe('/mis-reservas con el rol real turnogol_app', () => {
  it('control: la conexión es de verdad el rol restringido y sin BYPASSRLS', async () => {
    const who = await withPlayerContext(p1, async (tx) => {
      const rows = await tx.execute(
        drizzleSql`SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
      )
      return [...rows][0] as { u: string; bypass: boolean }
    })
    expect(who.u).toBe('turnogol_app')
    expect(who.bypass).toBe(false)
  })

  it('trae solo las reservas del jugador, con dirección y formato de complejos y canchas de otros tenants', async () => {
    const rows = await renderFor(p1)
    expect(rows.map((r) => r.id).sort()).toEqual([ids.p1A, ids.p1B].sort())
    const a = rows.find((r) => r.id === ids.p1A)!
    const b = rows.find((r) => r.id === ids.p1B)!
    expect([a.court_name, a.court_format, a.address]).toEqual([
      'Cancha A',
      5,
      'Calle A 111, Rosario',
    ])
    expect([b.court_name, b.court_format, b.address]).toEqual([
      'Cancha B',
      11,
      'Calle B 222, Funes',
    ])
    expect(a.directions_href).toContain('google.com/maps')
  })

  it('el otro jugador no ve las reservas de p1, ni siquiera en el complejo que comparten', async () => {
    const rows = await renderFor(p2)
    expect(rows.map((r) => r.id)).toEqual([ids.p2A])
  })
})
