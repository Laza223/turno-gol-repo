import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import {
  getPublicTenant,
  getPublicCourtCards,
  listTopPublicTenantSlugs,
} from '@/modules/tenants/public.service'
import { isPublicPortalIndexable, isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { getAverageRating, getReviewsByTenant } from '@/modules/reviews/review.service'
import { listPublicTournaments } from '@/modules/tournaments/tournament-public.service'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import { trackProfileViewedAction } from './actions'
import ComplexHero from '../components/ComplexHero'
import ProfileLayout from '../components/ProfileLayout'
import ProfileRest from '../components/ProfileRest'
import ReserveSection, { ReserveSkeleton } from '../components/ReserveSection'
import { PROFILE_TITLE } from '../components/styles'
import JsonLd from '@/components/seo/JsonLd'
import { buildLocalBusiness, buildBreadcrumbList } from '@/lib/seo/structured-data'

type Props = { params: Promise<{ slug: string }> }

// ISR: el perfil del complejo se regenera cada 5 min. Todo lo estático (nombre,
// fotos, canchas, reseñas, metadata y JSON-LD) sale del HTML cacheado; lo que
// depende del visitante (disponibilidad, ?date=, favorito, sesión, si está
// abierto ahora) se hidrata client-side. Nada en este árbol puede leer
// cookies()/headers()/searchParams, si no la ruta vuelve a ser dynamic.
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
        <div className="max-w-md space-y-3">
          <h1 className={PROFILE_TITLE}>{tenant.name}</h1>
          <p className="text-base text-muted-foreground">
            Este complejo no está disponible temporalmente.
          </p>
        </div>
      </div>
    )
  }

  // Datos complementarios (rating, canchas, reseñas, torneos). Resilientes: si
  // fallan, la página igual renderiza con la reserva y la cabecera.
  const [summary, courtCards, reviewsPage, tournaments] = await Promise.all([
    getAverageRating(tenant.id).catch(() => ({ average: 0, count: 0 })),
    getPublicCourtCards(tenant).catch(() => []),
    getReviewsByTenant(tenant.id, 10, 0).catch(() => ({ reviews: [], total: 0 })),
    // Devuelve [] con el flag apagado, que es el caso de casi todos: la sección
    // no aparece y el complejo no paga nada por una feature que no usa.
    listPublicTournaments(tenant.id).catch(() => []),
  ])

  const formats = [...new Set(courtCards.map((c) => c.format))].sort((a, b) => a - b)

  return (
    <>
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
      <ProfileLayout
        hero={
          <ComplexHero
            tenant={tenant}
            courtCount={courtCards.length}
            formats={formats}
            avgRating={summary.average}
            reviewCount={summary.count}
          />
        }
        reserve={
          // Es 100% client-side (fetch a /api/public/availability): el Suspense es obligatorio
          // porque ReserveSection usa useSearchParams() dentro de una ruta prerenderada.
          <Suspense fallback={<ReserveSkeleton />}>
            <ReserveSection
              tenant={tenant}
              formats={formats}
              trackViewed={trackProfileViewedAction}
            />
          </Suspense>
        }
        rest={
          <ProfileRest
            tenant={tenant}
            courts={courtCards}
            tournaments={tournaments}
            reviews={{
              initial: reviewsPage.reviews,
              total: reviewsPage.total,
              average: summary.average,
            }}
          />
        }
      />
    </>
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
