import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getPublicTenant, getPublicAvailability } from '@/modules/tenants/public.service'
import type { PublicTenant } from '@/modules/tenants/public.service'
import TenantHeader from './components/TenantHeader'
import AvailabilityGrid from './components/AvailabilityGrid'

type Props = { params: { slug: string } }

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

async function GridSection({ tenant, todayStr }: { tenant: PublicTenant; todayStr: string }) {
  const initialAvailability = await getPublicAvailability(tenant, todayStr)
  return (
    <AvailabilityGrid
      tenant={tenant}
      initialDate={todayStr}
      initialAvailability={initialAvailability}
    />
  )
}

export default async function PublicComplexPage({ params }: Props) {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) notFound()

  if (UNAVAILABLE_STATUSES.has(tenant.status)) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-foreground">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Este complejo no está disponible temporalmente.
          </p>
        </div>
      </main>
    )
  }

  const todayStr = getArtToday()

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <TenantHeader tenant={tenant} />
        <Suspense fallback={<div className="skeleton h-64 rounded-lg" />}>
          <GridSection tenant={tenant} todayStr={todayStr} />
        </Suspense>
      </div>
    </main>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) return {}
  return {
    title: `${tenant.name} — TurnoGol`,
    description: `Reservá una cancha en ${tenant.name}, ${tenant.city}.`,
  }
}
