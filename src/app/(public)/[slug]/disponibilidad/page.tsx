import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'
import { getPublicTenant, getPublicWeeklyAvailability } from '@/modules/tenants/public.service'
import { buildMetadata } from '@/lib/seo/metadata'
import WeeklyAvailability from './components/WeeklyAvailability'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])

function getArtToday(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default async function DisponibilidadPage({ params }: Props) {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant || UNAVAILABLE.has(tenant.status)) notFound()

  const week = await getPublicWeeklyAvailability(tenant, getArtToday())

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <Link href={`/${tenant.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> {tenant.name}
      </Link>
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Disponibilidad semanal</h1>
      <WeeklyAvailability slug={tenant.slug} week={week} />
    </div>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) return {}
  if (UNAVAILABLE.has(tenant.status)) {
    return buildMetadata({
      title: `Disponibilidad — ${tenant.name}`,
      description: `Mirá los turnos disponibles esta semana en ${tenant.name}, ${tenant.city}.`,
      path: `/${tenant.slug}/disponibilidad`,
      noIndex: true,
    })
  }
  return buildMetadata({
    title: `Disponibilidad — ${tenant.name}`,
    description: `Mirá los turnos disponibles esta semana en ${tenant.name}, ${tenant.city}.`,
    path: `/${tenant.slug}/disponibilidad`,
  })
}
