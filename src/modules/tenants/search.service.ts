import { and, asc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm'
import { getDb, getWorkerDb } from '@/shared/db/client'
import { courts, reviews, tenants } from '@/shared/db/schema'
import { track, withSpan } from '@/shared/observability'
import type { TenantSettings } from './tenant.types'

export type SortOption = 'name' | 'price' | 'rating' | 'distance'

export type PublicTenantCard = {
  id: string
  slug: string
  name: string
  address: string
  city: string
  province: string
  logoUrl: string | null
  coverUrl: string | null
  allowOnlineBooking: boolean
  // Interfaz pública estilo ATC.
  fromPriceCents: number | null
  amenities: Record<string, boolean>
  avgRating: number
  reviewCount: number
  distanceKm: number | null
  // Coordenadas (para el mapa) + facets denormalizados (para badges de la card).
  // Ya existen en la fila tenants y se usan internamente; se exponen para la UI.
  latitude: number | null
  longitude: number | null
  courtSurfaces: string[]
  courtFormats: number[]
}

export type SearchParams = {
  q?: string
  city?: string
  province?: string
  onlineOnly?: boolean
  // Filtros avanzados.
  surfaces?: string[] // synthetic_grass | natural_grass | cement | tile
  formats?: number[] // format: 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 (Fútbol N)
  amenities?: string[] // claves que deben ser true en tenants.amenities
  minPriceCents?: number
  maxPriceCents?: number
  // Ordenamiento + geo (cercanía).
  sort?: SortOption
  lat?: number
  lng?: number
  limit?: number
  offset?: number
  // Restricción a un conjunto de tenants (filtro de disponibilidad horaria).
  // undefined = sin restricción; [] = nadie disponible → resultado vacío.
  tenantIds?: string[]
}

export type SearchResult = { results: PublicTenantCard[]; total: number }
export type CityCount = { city: string; province: string; count: number }

// Estados de tenant visibles en superficies públicas (search + availability).
export const VISIBLE_TENANT_STATUSES = ['active', 'trialing'] as const
const VISIBLE = VISIBLE_TENANT_STATUSES

export async function searchPublicTenants(params: SearchParams): Promise<SearchResult> {
  return withSpan('search.public', 'db.query.search', () => searchPublicTenantsImpl(params))
}

async function searchPublicTenantsImpl(params: SearchParams): Promise<SearchResult> {
  // Lista vacía = el filtro de disponibilidad no dejó candidatos: cortar acá
  // (inArray con [] no es válido y la respuesta es trivialmente vacía).
  if (params.tenantIds && params.tenantIds.length === 0) {
    return { results: [], total: 0 }
  }

  const db = getDb()
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
  const offset = Math.max(params.offset ?? 0, 0)

  const conds: SQL[] = [inArray(tenants.status, VISIBLE as never)]
  if (params.tenantIds) conds.push(inArray(tenants.id, params.tenantIds))
  const q = params.q?.trim()
  if (q) conds.push(ilike(tenants.name, `%${q}%`))
  if (params.city) conds.push(eq(tenants.city, params.city))
  if (params.province) conds.push(eq(tenants.province, params.province))
  if (params.onlineOnly) {
    // Clave ausente = habilitado (coincide con el default del card mapping).
    conds.push(
      sql`COALESCE((${tenants.settings} ->> 'allow_online_booking')::boolean, true) = true`,
    )
  }

  // Filtro por superficie/formato vía facets denormalizados en tenants (overlap &&).
  // NO se consulta courts (RLS-aislada, sin policy pública → daría 0 en producción).
  if (params.surfaces?.length) {
    const list = sql.join(
      params.surfaces.map((s) => sql`${s}`),
      sql`, `,
    )
    conds.push(sql`${tenants.courtSurfaces} && ARRAY[${list}]::text[]`)
  }

  if (params.formats?.length) {
    const list = sql.join(
      params.formats.map((f) => sql`${f}`),
      sql`, `,
    )
    conds.push(sql`${tenants.courtFormats} && ARRAY[${list}]::integer[]`)
  }

  // Filtro por amenities: todas las solicitadas deben ser true.
  if (params.amenities?.length) {
    for (const a of params.amenities) {
      conds.push(sql`(${tenants.amenities} ->> ${a}) = 'true'`)
    }
  }

  // Rango de precio sobre el mínimo denormalizado (excluye NULL = sin canchas online).
  if (typeof params.minPriceCents === 'number') {
    conds.push(sql`${tenants.fromPriceCents} >= ${params.minPriceCents}`)
  }
  if (typeof params.maxPriceCents === 'number') {
    conds.push(sql`${tenants.fromPriceCents} <= ${params.maxPriceCents}`)
  }

  const where = and(...conds)

  const hasGeo = typeof params.lat === 'number' && typeof params.lng === 'number'
  const distanceSql: SQL<number | null> = hasGeo
    ? sql<number | null>`CASE
        WHEN ${tenants.latitude} IS NULL OR ${tenants.longitude} IS NULL THEN NULL
        ELSE 6371 * acos(least(1, greatest(-1,
          cos(radians(${params.lat})) * cos(radians(${tenants.latitude}::float8)) *
            cos(radians(${tenants.longitude}::float8) - radians(${params.lng})) +
          sin(radians(${params.lat})) * sin(radians(${tenants.latitude}::float8))
        )))
      END`
    : sql<number | null>`NULL::float8`

  // Agregado de reseñas por tenant como tabla derivada (LEFT JOIN). Evita
  // subconsultas correlacionadas en el SELECT (drizzle no califica la columna
  // externa dentro del subquery, lo que rompe la correlación).
  const ratings = db
    .select({
      tenantId: reviews.tenantId,
      avg: sql<number>`ROUND(AVG(${reviews.rating})::numeric, 2)::float8`.as('avg_rating'),
      cnt: sql<number>`COUNT(*)::int`.as('review_count'),
    })
    .from(reviews)
    .groupBy(reviews.tenantId)
    .as('ratings')

  let orderBy: SQL
  switch (params.sort) {
    case 'price':
      orderBy = sql`${tenants.fromPriceCents} ASC NULLS LAST`
      break
    case 'rating':
      orderBy = sql`${ratings.avg} DESC NULLS LAST, ${ratings.cnt} DESC NULLS LAST`
      break
    case 'distance':
      orderBy = hasGeo ? sql`${distanceSql} ASC NULLS LAST` : (asc(tenants.name) as SQL)
      break
    default:
      orderBy = asc(tenants.name) as SQL
  }

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        address: tenants.address,
        city: tenants.city,
        province: tenants.province,
        logoUrl: tenants.logoUrl,
        coverUrl: tenants.coverUrl,
        settings: tenants.settings,
        fromPriceCents: tenants.fromPriceCents,
        amenities: tenants.amenities,
        latitude: tenants.latitude,
        longitude: tenants.longitude,
        courtSurfaces: tenants.courtSurfaces,
        courtFormats: tenants.courtFormats,
        avgRating: sql<number>`COALESCE(${ratings.avg}, 0)`,
        reviewCount: sql<number>`COALESCE(${ratings.cnt}, 0)`,
        distanceKm: distanceSql,
      })
      .from(tenants)
      .leftJoin(ratings, eq(ratings.tenantId, tenants.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(where),
  ])

  const results: PublicTenantCard[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    address: r.address,
    city: r.city,
    province: r.province,
    logoUrl: r.logoUrl,
    coverUrl: r.coverUrl,
    allowOnlineBooking: (r.settings as TenantSettings).allow_online_booking ?? true,
    fromPriceCents: r.fromPriceCents ?? null,
    amenities: (r.amenities ?? {}) as Record<string, boolean>,
    avgRating: Number(r.avgRating ?? 0),
    reviewCount: Number(r.reviewCount ?? 0),
    distanceKm: r.distanceKm == null ? null : Math.round(Number(r.distanceKm) * 10) / 10,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    courtSurfaces: r.courtSurfaces ?? [],
    courtFormats: r.courtFormats ?? [],
  }))
  const total = countRows[0]?.count ?? 0
  // No loguear params.q (texto libre, PII — Ley 25.326). Solo presencia y filtros acotados.
  track.search('search.public.query', {
    hasQuery: Boolean(params.q?.trim()),
    city: params.city,
    province: params.province,
    onlineOnly: params.onlineOnly,
    results: total,
  })
  return { results, total }
}

/**
 * Fotos de canchas por tenant para el carrusel de las cards de /explorar
 * (tenantId → urls, en orden de creación de la cancha). Lectura cross-tenant
 * de courts SIN tenant context: mismo motivo que loadAvailableTenantIds
 * (availability-search.service.ts) para usar el pool worker — bajo el pool
 * restringido `turnogol_app` (PR #30, FORCE RLS, sin BYPASSRLS) esto devolvía
 * 0 filas para TODA card (degradaba silenciosamente al coverUrl). Solo se
 * leen fotos, que ya son públicas en el perfil del complejo.
 */
export async function getCourtPhotosByTenant(
  tenantIds: string[],
): Promise<Record<string, string[]>> {
  if (tenantIds.length === 0) return {}
  const db = getWorkerDb()
  const rows = await db
    .select({ tenantId: courts.tenantId, photos: courts.photos })
    .from(courts)
    .where(and(inArray(courts.tenantId, tenantIds), eq(courts.status, 'online')))
    .orderBy(asc(courts.createdAt))

  const map: Record<string, string[]> = {}
  for (const r of rows) {
    const photos = ((r.photos ?? []) as string[]).filter(Boolean)
    if (photos.length === 0) continue
    map[r.tenantId] = [...(map[r.tenantId] ?? []), ...photos]
  }
  return map
}

export async function listPublicCities(): Promise<CityCount[]> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT city, province, count(*)::int AS count
    FROM tenants
    WHERE status IN ('active', 'trialing')
    GROUP BY city, province
    ORDER BY count DESC, city ASC
  `)
  return rows as unknown as CityCount[]
}
