import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withContext, withPlayerContext } from '@/shared/db/client'
import { searchPublicTenants } from '@/modules/tenants/search.service'
import { createReview } from '@/modules/reviews/review.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { insertBooking } from '../helpers/factories'

type Pricing = {
  rules: { days: string[]; from: string; to: string; price: number }[]
}
function pricing(p60: number): Pricing {
  return {
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '08:00',
        to: '23:00',
        price: p60,
      },
    ],
  }
}

async function insertCourt(
  tenantId: string,
  opts: { surface?: string; capacity?: number; p60?: number; status?: string } = {},
): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, surface_type, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha'}, ${opts.capacity ?? 10},
      ${opts.surface ?? 'synthetic_grass'}::surface_type,
      ${sql.json(pricing(opts.p60 ?? 800000))},
      ${opts.status ?? 'online'}::court_status
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function setAmenities(tenantId: string, amenities: Record<string, boolean>): Promise<void> {
  const sql = getSql()
  await sql`UPDATE tenants SET amenities = ${sql.json(amenities)} WHERE id = ${tenantId}`
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('search upgrade: from_price_cents (trigger)', () => {
  it('expone el precio mínimo de las canchas online', async () => {
    const tenant = await createTestTenant()
    await insertCourt(tenant.id, { p60: 1200000 })
    await insertCourt(tenant.id, { p60: 700000 }) // más barata
    // Cancha offline con precio aún menor: NO debe contar.
    await insertCourt(tenant.id, { p60: 100000, status: 'offline' })

    const { results } = await searchPublicTenants({ city: undefined, q: undefined })
    const card = results.find((r) => r.id === tenant.id)!
    expect(card.fromPriceCents).toBe(700000) // mínimo entre canchas online
  })
})

describe('search upgrade: filtros', () => {
  it('filtra por superficie (cancha online con esa superficie)', async () => {
    const synthetic = await createTestTenant()
    await insertCourt(synthetic.id, { surface: 'synthetic_grass' })
    const indoor = await createTestTenant()
    await insertCourt(indoor.id, { surface: 'indoor' })

    const { results } = await searchPublicTenants({ surfaces: ['indoor'] })
    const ids = results.map((r) => r.id)
    expect(ids).toContain(indoor.id)
    expect(ids).not.toContain(synthetic.id)
  })

  it('filtra por formato (capacity)', async () => {
    const f5 = await createTestTenant()
    await insertCourt(f5.id, { capacity: 5 })
    const f11 = await createTestTenant()
    await insertCourt(f11.id, { capacity: 11 })

    const { results } = await searchPublicTenants({ formats: [11] })
    const ids = results.map((r) => r.id)
    expect(ids).toContain(f11.id)
    expect(ids).not.toContain(f5.id)
  })

  it('filtra por amenities (todas requeridas en true)', async () => {
    const full = await createTestTenant()
    await insertCourt(full.id)
    await setAmenities(full.id, { duchas: true, parrilla: true, wifi: false })
    const partial = await createTestTenant()
    await insertCourt(partial.id)
    await setAmenities(partial.id, { duchas: true, parrilla: false })

    const { results } = await searchPublicTenants({ amenities: ['duchas', 'parrilla'] })
    const ids = results.map((r) => r.id)
    expect(ids).toContain(full.id)
    expect(ids).not.toContain(partial.id)
  })

  it('#1 los filtros de superficie/formato NO dependen de RLS de courts (regresión)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await insertCourt(tenant.id, { surface: 'indoor', capacity: 11 }) // trigger denormaliza facets

    // Facets en tenants (tabla global, sin RLS) → legibles sin tenant context.
    const byFacet = await withContext({ role: 'authenticated' }, (tx) =>
      tx`SELECT id FROM tenants WHERE id = ${tenant.id} AND court_surfaces && ARRAY['indoor']::text[] AND court_formats && ARRAY[11]::integer[]` as unknown as Promise<
        unknown[]
      >,
    )
    expect((byFacet as unknown as unknown[]).length).toBe(1)

    // En cambio courts NO es legible sin tenant context (por eso el viejo EXISTS daba 0 en prod).
    const courtsVisible = await withContext({ role: 'authenticated' }, (tx) =>
      tx`SELECT 1 FROM courts WHERE tenant_id = ${tenant.id}` as unknown as Promise<unknown[]>,
    )
    expect((courtsVisible as unknown as unknown[]).length).toBe(0)
  })

  it('#5 onlineOnly: clave ausente = habilitado (coherente con el card)', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const t = await createTestTenant(sql)
    await insertCourt(t.id)
    await sql`UPDATE tenants SET settings = '{}'::jsonb WHERE id = ${t.id}`

    const { results } = await searchPublicTenants({ onlineOnly: true })
    const card = results.find((r) => r.id === t.id)
    expect(card).toBeTruthy() // incluido pese a la clave ausente
    expect(card!.allowOnlineBooking).toBe(true) // el card coincide con el filtro
  })

  it('filtra por rango de precio sobre from_price_cents', async () => {
    const cheap = await createTestTenant()
    await insertCourt(cheap.id, { p60: 500000 })
    const pricey = await createTestTenant()
    await insertCourt(pricey.id, { p60: 2000000 })

    const { results } = await searchPublicTenants({ minPriceCents: 400000, maxPriceCents: 1000000 })
    const ids = results.map((r) => r.id)
    expect(ids).toContain(cheap.id)
    expect(ids).not.toContain(pricey.id)
  })
})

describe('search upgrade: ordenamiento', () => {
  it('ordena por precio ascendente', async () => {
    const sql = getSql()
    await cleanupAll(sql) // aislar el orden global
    const a = await createTestTenant(sql, { name: 'AAA' })
    await insertCourt(a.id, { p60: 1500000 })
    const b = await createTestTenant(sql, { name: 'BBB' })
    await insertCourt(b.id, { p60: 600000 })

    const { results } = await searchPublicTenants({ sort: 'price' })
    expect(results[0]!.id).toBe(b.id) // 600000 antes que 1500000
    expect(results[0]!.fromPriceCents).toBe(600000)
  })

  it('ordena por rating descendente', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    const low = await createTestTenant(sql, { name: 'Low' })
    const courtLow = await insertCourt(low.id)
    const high = await createTestTenant(sql, { name: 'High' })
    const courtHigh = await insertCourt(high.id)

    // Reseñas: high=5, low=2.
    const reviewer1 = await createTestPlayer()
    const bHigh = await insertBooking(sql, {
      tenantId: high.id,
      courtId: courtHigh,
      playerId: reviewer1.id,
      status: 'completed',
      timeStart: '10:00',
      timeEnd: '10:30',
    })
    await withPlayerContext(reviewer1.id, (tx) => createReview(reviewer1.id, bHigh, 5, null, tx))

    const reviewer2 = await createTestPlayer()
    const bLow = await insertBooking(sql, {
      tenantId: low.id,
      courtId: courtLow,
      playerId: reviewer2.id,
      status: 'completed',
      timeStart: '11:00',
      timeEnd: '11:30',
    })
    await withPlayerContext(reviewer2.id, (tx) => createReview(reviewer2.id, bLow, 2, null, tx))

    const { results } = await searchPublicTenants({ sort: 'rating' })
    expect(results[0]!.id).toBe(high.id)
    expect(results[0]!.avgRating).toBe(5)
    expect(results[0]!.reviewCount).toBe(1)
  })

  it('ordena por cercanía cuando hay coordenadas', async () => {
    const sql = getSql()
    await cleanupAll(sql)
    // Cerca de Obelisco (-34.6037, -58.3816).
    const near = await createTestTenant(sql, { name: 'Cerca' })
    await insertCourt(near.id)
    await sql`UPDATE tenants SET latitude = -34.6040, longitude = -58.3820 WHERE id = ${near.id}`
    const far = await createTestTenant(sql, { name: 'Lejos' })
    await insertCourt(far.id)
    await sql`UPDATE tenants SET latitude = -31.4201, longitude = -64.1888 WHERE id = ${far.id}` // Córdoba

    const { results } = await searchPublicTenants({
      sort: 'distance',
      lat: -34.6037,
      lng: -58.3816,
    })
    expect(results[0]!.id).toBe(near.id)
    expect(results[0]!.distanceKm).not.toBeNull()
    expect(results[0]!.distanceKm!).toBeLessThan(results[1]!.distanceKm!)
  })
})
