import { inArray } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'

export type SitemapTenant = {
  slug: string
  updatedAt: Date
}

// Only active|trialing tenants are publicly indexable.
// `tenants` is a global table (no RLS) — no context needed.
export async function listSitemapTenants(): Promise<SitemapTenant[]> {
  const db = getDb()
  const rows = await db
    .select({ slug: tenants.slug, updatedAt: tenants.updatedAt })
    .from(tenants)
    .where(inArray(tenants.status, ['active', 'trialing']))
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt }))
}
