import type { MetadataRoute } from 'next'
import { listSitemapTenants, type SitemapTenant } from '@/modules/tenants/sitemap.service'
import { listPublicTournamentSlugs } from '@/modules/tournaments/tournament-public.service'
import { absoluteUrl } from '@/lib/seo/metadata'
import { getContentPage, lastModified, listBlogPosts } from '@/lib/content/posts'

export const revalidate = 3600

/**
 * Cuántos complejos se consultan a la vez al buscar sus torneos públicos.
 * Cada uno abre su propia transacción bajo RLS (`withTenantContext`), así que
 * un `Promise.all` plano sobre N complejos podría vaciar el pool. Con ISR de
 * 1 hora la latencia de esta página no le importa a nadie; la salud del pool sí.
 */
const TOURNAMENT_LOOKUP_CONCURRENCY = 5

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
    {
      url: absoluteUrl('/para-complejos'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    { url: absoluteUrl('/precios'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/blog'), lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    {
      url: absoluteUrl('/privacidad'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
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
      return [
        {
          url: absoluteUrl(path),
          lastModified: lastModified(page),
          changeFrequency: 'monthly' as const,
          priority: 0.7,
        },
      ]
    }),
  ]

  const tenants = await listSitemapTenants()
  const tenantRoutes: MetadataRoute.Sitemap = tenants.map((t) => ({
    url: absoluteUrl(`/${t.slug}`),
    lastModified: t.updatedAt,
    changeFrequency: 'daily',
    priority: 0.9,
  }))

  const tournamentRoutes = await listTournamentRoutes(tenants, now)

  return [...staticRoutes, ...editorialRoutes, ...tenantRoutes, ...tournamentRoutes]
}

/**
 * Rutas del portal público de torneos. Hasta B5 el sitemap no las emitía:
 * `/[slug]/torneos` y sus fichas eran páginas públicas indexables a las que no
 * llegaba ningún enlace ni entrada de sitemap, o sea invisibles para Google.
 *
 * `listPublicTournamentSlugs` ya aplica los dos filtros que corresponden — el
 * feature flag por complejo y `is_public` + estado publicable — así que un
 * complejo con el módulo apagado devuelve `[]` y no aporta ninguna URL. El
 * listado (`/[slug]/torneos`) solo se emite si el complejo tiene al menos un
 * torneo público: una página vacía no merece estar en el sitemap.
 */
async function listTournamentRoutes(
  tenants: SitemapTenant[],
  now: Date,
): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = []

  for (let i = 0; i < tenants.length; i += TOURNAMENT_LOOKUP_CONCURRENCY) {
    const chunk = tenants.slice(i, i + TOURNAMENT_LOOKUP_CONCURRENCY)
    const results = await Promise.all(
      chunk.map(async (t) => ({
        tenant: t,
        // Un complejo que falla no puede tirar abajo el sitemap entero: las
        // rutas estáticas y de perfil valen más que las de torneos.
        slugs: await listPublicTournamentSlugs(t.id).catch(() => [] as string[]),
      })),
    )

    for (const { tenant, slugs } of results) {
      if (slugs.length === 0) continue
      routes.push({
        url: absoluteUrl(`/${tenant.slug}/torneos`),
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.6,
      })
      for (const torneoSlug of slugs) {
        routes.push({
          url: absoluteUrl(`/${tenant.slug}/torneos/${torneoSlug}`),
          lastModified: now,
          changeFrequency: 'daily',
          priority: 0.5,
        })
      }
    }
  }

  return routes
}
