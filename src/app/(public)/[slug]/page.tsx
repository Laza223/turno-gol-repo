import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Trophy } from 'lucide-react'
import {
  getPublicTenant,
  getPublicCourtCards,
  listTopPublicTenantSlugs,
} from '@/modules/tenants/public.service'
import { isPublicPortalIndexable, isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { getAverageRating, getReviewsByTenant } from '@/modules/reviews/review.service'
import { listPublicTournaments } from '@/modules/tournaments/tournament-public.service'
import { STATUS_LABELS, formatDateRange } from '@/app/(admin)/torneos/torneos-lib'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import TenantHeader from './components/TenantHeader'
import TenantGallery from './components/TenantGallery'
import CourtCard from './components/CourtCard'
import ReviewsSection from './components/ReviewsSection'
import AvailabilityGrid from './components/AvailabilityGrid'
import { Skeleton } from '@/components/ui/skeleton'
import JsonLd from '@/components/seo/JsonLd'
import { buildLocalBusiness, buildBreadcrumbList } from '@/lib/seo/structured-data'

type Props = { params: Promise<{ slug: string }> }

// ISR: el perfil del complejo se regenera cada 5 min. Todo lo estático (nombre,
// fotos, canchas, reseñas, metadata y JSON-LD) sale del HTML cacheado; lo que
// depende del visitante (disponibilidad, ?date=, favorito, sesión) se hidrata
// client-side. Nada en este árbol puede leer cookies()/headers()/searchParams,
// si no la ruta vuelve a ser dynamic.
export const revalidate = 300

// Pre-genera en build los perfiles de los complejos más activos; el resto se
// genera on-demand en el primer hit (dynamicParams queda en su default true).
// Fail-open: si el build corre sin DB, devuelve [] y no se pre-genera ninguno.
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await listTopPublicTenantSlugs(50).catch(() => [])
  return slugs.map((slug) => ({ slug }))
}

export default async function PublicComplexPage(props: Props) {
  const tenant = await getPublicTenant((await props.params).slug)
  if (!tenant) notFound()

  // Gate server-side: un complejo suspendido/dado de baja no expone su perfil.
  // Con ISR puede servirse stale hasta 300s tras el cambio de estado (aceptable).
  if (!isPublicPortalOpen(tenant.status, tenant.canceledPeriodEnd)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold text-foreground">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Este complejo no está disponible temporalmente.
          </p>
        </div>
      </div>
    )
  }

  // Datos complementarios (rating, canchas, reseñas, torneos). Resilientes: si
  // fallan, la página igual renderiza con la grilla y el header.
  const [summary, courtCards, reviewsPage, tournaments] = await Promise.all([
    getAverageRating(tenant.id).catch(() => ({ average: 0, count: 0 })),
    getPublicCourtCards(tenant).catch(() => []),
    getReviewsByTenant(tenant.id, 10, 0).catch(() => ({ reviews: [], total: 0 })),
    // Devuelve [] con el flag apagado, que es el caso de casi todos: la sección
    // no aparece y el complejo no paga nada por una feature que no usa.
    listPublicTournaments(tenant.id).catch(() => []),
  ])

  const galleryPhotos = Array.from(
    new Set([tenant.coverUrl, ...courtCards.flatMap((c) => c.photos)].filter(Boolean)),
  ) as string[]

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={[
          buildLocalBusiness(tenant),
          buildBreadcrumbList([
            { name: 'Inicio', url: absoluteUrl('/') },
            { name: 'Explorar', url: absoluteUrl('/explorar') },
            { name: tenant.name, url: absoluteUrl(`/${tenant.slug}`) },
          ]),
        ]}
      />

      {/* Clean sheet — structured, premium, deep soft shadow */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-[0_24px_70px_-38px_rgba(2,6,23,.4)] sm:p-6 lg:p-8 space-y-7">
        {galleryPhotos.length > 0 && <TenantGallery photos={galleryPhotos} name={tenant.name} />}

        <TenantHeader tenant={tenant} avgRating={summary.average} reviewCount={summary.count} />

        {courtCards.length > 0 && (
          <section aria-label="Canchas" className="space-y-3.5">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              Canchas{' '}
              <span className="font-sans text-sm font-normal text-muted-foreground">
                ({courtCards.length})
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {courtCards.map((court) => (
                <CourtCard key={court.id} court={court} />
              ))}
            </div>
          </section>
        )}

        {tournaments.length > 0 && (
          <section aria-label="Torneos" className="space-y-3.5">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              Torneos{' '}
              <span className="font-sans text-sm font-normal text-muted-foreground">
                ({tournaments.length})
              </span>
            </h2>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {tournaments.slice(0, 4).map((t) => (
                <li key={t.slug}>
                  <Link
                    href={`/${tenant.slug}/torneos/${t.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:bg-accent/50"
                  >
                    <Trophy className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {t.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {STATUS_LABELS[t.status]} · {formatDateRange(t.startsOn, t.endsOn)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {tournaments.length > 4 && (
              <Link
                href={`/${tenant.slug}/torneos`}
                className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver los {tournaments.length} torneos
              </Link>
            )}
          </section>
        )}

        {/* La grilla es 100% client-side (fetch a /api/public/availability): el
            Suspense es obligatorio porque AvailabilityGrid usa useSearchParams()
            dentro de una ruta prerenderada estáticamente. */}
        <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
          <AvailabilityGrid tenant={tenant} />
        </Suspense>

        <ReviewsSection
          tenantId={tenant.id}
          initial={reviewsPage.reviews}
          total={reviewsPage.total}
          average={summary.average}
        />
      </div>
    </div>
  )
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) return {}
  if (!isPublicPortalIndexable(tenant.status)) {
    return buildMetadata({
      title: tenant.name,
      description: `Reservá una cancha en ${tenant.name}, ${tenant.city}.`,
      path: `/${tenant.slug}`,
      noIndex: true,
    })
  }
  return buildMetadata({
    title: tenant.name,
    description: tenant.description ?? `Reservá una cancha en ${tenant.name}, ${tenant.city}.`,
    path: `/${tenant.slug}`,
    image: tenant.coverUrl ?? undefined,
  })
}
