import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getPublicTenant, getPublicAvailability } from '@/modules/tenants/public.service'
import type { PublicTenant } from '@/modules/tenants/public.service'
import TenantHeader from './components/TenantHeader'
import AvailabilityGrid from './components/AvailabilityGrid'

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
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-foreground">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Este complejo no está disponible temporalmente.
          </p>
        </div>
      </div>
    )
  }

  const todayStr = getArtToday()
  const maxStr = addDaysStr(todayStr, tenant.bookingAdvanceDays)
  const reqDate = props.searchParams.date
  const initialDate =
    reqDate && /^\d{4}-\d{2}-\d{2}$/.test(reqDate) && reqDate >= todayStr && reqDate <= maxStr
      ? reqDate
      : todayStr

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <TenantHeader tenant={tenant} />
      <Suspense fallback={<div className="skeleton h-64 rounded-lg" />}>
        <GridSection tenant={tenant} initialDate={initialDate} />
      </Suspense>
    </div>
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
