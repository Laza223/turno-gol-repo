import type { MetadataRoute } from 'next'
import { listSitemapTenants } from '@/modules/tenants/sitemap.service'
import { absoluteUrl } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // 1 hour — sitemap is dynamic but doesn't need per-request freshness

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: absoluteUrl('/explorar'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/privacy'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/terms'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const tenants = await listSitemapTenants()
  const tenantRoutes: MetadataRoute.Sitemap = tenants.map((t) => ({
    url: absoluteUrl(`/${t.slug}`),
    lastModified: t.updatedAt,
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  return [...staticRoutes, ...tenantRoutes]
}
