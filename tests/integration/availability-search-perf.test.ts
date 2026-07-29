import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { findAvailableTenantIds } from '@/modules/tenants/availability-search.service'
import { __setSlotsCacheStoreForTests, __resetSlotsCacheForTests } from '@/shared/cache/slots-cache'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

// Verifica el presupuesto de la spec: la búsqueda cross-tenant SIN cache debe
// resolver 50 complejos (~150 canchas, ~600 bookings) en menos de 500ms.
// El algoritmo es 2 round-trips fijos, así que el margen real es amplio.

const TAG = `avsperf${Date.now()}`
const TENANTS = 50
const COURTS_PER_TENANT = 3
const DATE = addDays(artTodayStr(), 1)
const TIME = '20:00'

const OPEN_ALL_DAYS = JSON.stringify(
  Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
      d,
      { open: '08:00', close: '23:00' },
    ]),
  ),
)

beforeAll(async () => {
  __setSlotsCacheStoreForTests(null) // medir DB, no Redis
  await ensureRoles()
  const sql = getSql()

  for (let t = 0; t < TENANTS; t++) {
    const tenantRows = await sql<{ id: string }[]>`
      INSERT INTO tenants (slug, name, address, city, province, phone, email, status, opening_hours)
      VALUES (
        ${`${TAG}-${t}`}, ${`${TAG} ${t}`}, 'x', 'Rosario', 'Santa Fe', '1',
        ${`${TAG}${t}@t.local`}, 'active', ${OPEN_ALL_DAYS}::jsonb
      )
      RETURNING id
    `
    const tenantId = tenantRows[0]!.id
    for (let c = 0; c < COURTS_PER_TENANT; c++) {
      const courtRows = await sql<{ id: string }[]>`
        INSERT INTO courts (tenant_id, name, capacity, status)
        VALUES (${tenantId}, ${`Cancha ${c}`}, 5, 'online')
        RETURNING id
      `
      const courtId = courtRows[0]!.id
      // Día cargado: 4 bookings por cancha; en la mitad de los tenants una de
      // ellas pisa el horario buscado.
      const hours = t % 2 === 0 ? ['18:00', '19:00', '20:00', '21:00'] : ['14:00', '15:00', '16:00', '17:00']
      for (const h of hours) {
        const end = `${String(Number(h.slice(0, 2)) + 1).padStart(2, '0')}:00`
        await sql`
          INSERT INTO bookings (
            tenant_id, court_id, date, time_start, time_end, starts_at, ends_at, status, price_snapshot
          )
          VALUES (
            ${tenantId}, ${courtId}, ${DATE}, ${h}, ${end},
            (${DATE}::date + ${h}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
            (${DATE}::date + ${end}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
            'confirmed', 0
          )
        `
      }
    }
  }
}, 120_000)

afterAll(async () => {
  __resetSlotsCacheForTests()
  await cleanupAll()
  await closeSql()
})

describe('findAvailableTenantIds @ 50 tenants', () => {
  it('answers an uncached search in under 500ms', async () => {
    // Warm-up: pool de conexiones + plan cache fuera de la medición.
    await findAvailableTenantIds({ date: DATE, time: '09:00' })

    const t0 = performance.now()
    const ids = await findAvailableTenantIds({ date: DATE, time: TIME })
    const elapsed = performance.now() - t0

    // Los tenants impares (bookings a la tarde) están libres a las 20:00.
    expect(ids.length).toBeGreaterThanOrEqual(Math.floor(TENANTS / 2))
    console.info(`findAvailableTenantIds(50 tenants, sin cache): ${elapsed.toFixed(1)}ms`)
    expect(elapsed).toBeLessThan(500)
  })
})
