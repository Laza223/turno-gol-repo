import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import {
  getPublicTenant,
  getPublicAvailability,
  getPublicCourtCards,
} from '@/modules/tenants/public.service'
import { getAverageRating, getReviewsByTenant } from '@/modules/reviews/review.service'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import type { PublicTenant } from '@/modules/tenants/public.service'
import TenantHeader from './components/TenantHeader'
import TenantGallery from './components/TenantGallery'
import CourtCard from './components/CourtCard'
import ReviewsSection from './components/ReviewsSection'
import AvailabilityGrid from './components/AvailabilityGrid'
import { Skeleton } from '@/components/ui/skeleton'
import JsonLd from '@/components/seo/JsonLd'
import { buildLocalBusiness, buildBreadcrumbList } from '@/lib/seo/structured-data'

type Props = { params: { slug: string }; searchParams: { date?: string } }

const UNAVAILABLE_STATUSES = new Set([
  'suspended',
  'blocked',
  'canceled',
  'churned',
  'deleted',
])

function getArtToday(): string {
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return artNow.toISOString().slice(0, 10)
}

function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

async function GridSection({ tenant, initialDate }: { tenant: PublicTenant; initialDate: string }) {
  const initialAvailability = await getPublicAvailability(tenant, initialDate)
  return (
    <AvailabilityGrid
      tenant={tenant}
      initialDate={initialDate}
      initialAvailability={initialAvailability}
    />
  )
}

export default async function PublicComplexPage(props: Props) {
  const tenant = await getPublicTenant(props.params.slug)
  if (!tenant) notFound()

  if (UNAVAILABLE_STATUSES.has(tenant.status)) {
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

  // Datos complementarios (rating, canchas, reseñas). Resilientes: si fallan, la
  // página igual renderiza con la grilla y el header.
  const [summary, courtCards, reviewsPage] = await Promise.all([
    getAverageRating(tenant.id).catch(() => ({ average: 0, count: 0 })),
    getPublicCourtCards(tenant).catch(() => []),
    getReviewsByTenant(tenant.id, 10, 0).catch(() => ({ reviews: [], total: 0 })),
  ])

  const galleryPhotos = Array.from(
    new Set([tenant.coverUrl, ...courtCards.flatMap((c) => c.photos)].filter(Boolean)),
  ) as string[]

  const todayStr = getArtToday()
  const maxStr = addDaysStr(todayStr, tenant.bookingAdvanceDays)
  const reqDate = props.searchParams.date
  const initialDate =
    reqDate && /^\d{4}-\d{2}-\d{2}$/.test(reqDate) && reqDate >= todayStr && reqDate <= maxStr
      ? reqDate
      : todayStr

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
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

      {galleryPhotos.length > 0 && <TenantGallery photos={galleryPhotos} name={tenant.name} />}

      <TenantHeader tenant={tenant} avgRating={summary.average} reviewCount={summary.count} />

      {courtCards.length > 0 && (
        <section aria-label="Canchas" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Canchas <span className="text-sm font-normal text-slate-400">({courtCards.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {courtCards.map((court) => (
              <CourtCard key={court.id} court={court} />
            ))}
          </div>
        </section>
      )}

      <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
        <GridSection tenant={tenant} initialDate={initialDate} />
      </Suspense>

      <ReviewsSection
        tenantId={tenant.id}
        initial={reviewsPage.reviews}
        total={reviewsPage.total}
        average={summary.average}
      />
    </div>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) return {}
  if (UNAVAILABLE_STATUSES.has(tenant.status)) {
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
