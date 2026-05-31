import { and, eq, ilike, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import type { TenantSettings } from './tenant.types'

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
}

export type SearchParams = {
  q?: string
  city?: string
  province?: string
  onlineOnly?: boolean
  limit?: number
  offset?: number
}

export type SearchResult = { results: PublicTenantCard[]; total: number }
export type CityCount = { city: string; province: string; count: number }

const VISIBLE = ['active', 'trialing']

export async function searchPublicTenants(params: SearchParams): Promise<SearchResult> {
  const db = getDb()
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
  const offset = Math.max(params.offset ?? 0, 0)

  const conds = [inArray(tenants.status, VISIBLE as never)]
  const q = params.q?.trim()
  if (q) conds.push(ilike(tenants.name, `%${q}%`))
  if (params.city) conds.push(eq(tenants.city, params.city))
  if (params.province) conds.push(eq(tenants.province, params.province))
  if (params.onlineOnly) {
    conds.push(sql`(${tenants.settings} ->> 'allow_online_booking') = 'true'`)
  }
  const where = and(...conds)

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
      })
      .from(tenants)
      .where(where)
      .orderBy(tenants.name)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tenants).where(where),
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
  }))
  return { results, total: countRows[0]?.count ?? 0 }
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
