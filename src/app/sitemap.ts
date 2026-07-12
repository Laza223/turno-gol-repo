import type { MetadataRoute } from 'next'
import { listSitemapTenants } from '@/modules/tenants/sitemap.service'
import { absoluteUrl } from '@/lib/seo/metadata'
import { getContentPage, lastModified, listBlogPosts } from '@/lib/content/posts'

export const revalidate = 3600

/** Páginas editoriales standalone (content/pages/*.mdx) y su ruta pública. */
const CONTENT_PAGES: Array<{ slug: string; path: string }> = [
  { slug: 'vs-alquila-tu-cancha', path: '/vs/alquila-tu-cancha' },
  { slug: 'alternativas-alquila-tu-cancha', path: '/alternativas-alquila-tu-cancha' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: absoluteUrl('/explorar'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/para-complejos'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/precios'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/blog'), lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: absoluteUrl('/privacidad'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/terminos'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const editorialRoutes: MetadataRoute.Sitemap = [
    ...listBlogPosts().map((p) => ({
      url: absoluteUrl(`/blog/${p.slug}`),
      lastModified: lastModified(p),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...CONTENT_PAGES.flatMap(({ slug, path }) => {
      const page = getContentPage(slug)
      if (!page) return []
      return [{
        url: absoluteUrl(path),
        lastModified: lastModified(page),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }]
    }),
  ]

  const tenants = await listSitemapTenants()
  const tenantRoutes: MetadataRoute.Sitemap = tenants.map((t) => ({
    url: absoluteUrl(`/${t.slug}`),
    lastModified: t.updatedAt,
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  return [...staticRoutes, ...editorialRoutes, ...tenantRoutes]
}
