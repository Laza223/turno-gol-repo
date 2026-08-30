import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { VISIBLE_TENANT_STATUSES } from './search.service'

export type SitemapTenant = {
  /** Necesario para las rutas hijas tenant-aisladas (torneos), que van bajo RLS. */
  id: string
  slug: string
  updatedAt: Date
}

// Only active|trialing tenants are publicly indexable, y (F-004, QA prod
// 2026-08-17) solo los que pasan la misma condición de completitud que
// searchPublicTenants: onboarding cerrado. Antes indexaba cualquier trial
// abandonado a medio terminar.
// `tenants` is a global table (no RLS) — no context needed.
export async function listSitemapTenants(): Promise<SitemapTenant[]> {
  const db = getDb()
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, updatedAt: tenants.updatedAt })
    .from(tenants)
    .where(
      and(
        inArray(tenants.status, VISIBLE_TENANT_STATUSES as never),
        eq(tenants.marketplaceVisible, true),
        sql`COALESCE((${tenants.settings} ->> 'onboarding_completed')::boolean, false) = true`,
      ),
    )
  return rows.map((r) => ({ id: r.id, slug: r.slug, updatedAt: r.updatedAt }))
}
