import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { getPublicTournamentView } from '@/modules/tournaments/tournament-public.service'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import { buildBreadcrumbList } from '@/lib/seo/structured-data'
import JsonLd from '@/components/seo/JsonLd'
import {
  FORMAT_SHORT,
  STATUS_LABELS,
  formatDateRange,
  statusBadgeClass,
} from '@/app/(admin)/torneos/torneos-lib'
import { TorneoPublicView } from '../components/TorneoPublicView'

// Un torneo en curso cambia cada vez que se carga un resultado. 5 min de ISR
// es el mismo compromiso que el perfil del complejo: el que mira desde la
// cancha puede ver la tabla hasta 5 minutos atrasada, y a cambio la página no
// pega a la base en cada visita.
export const revalidate = 300

type Props = { params: Promise<{ slug: string; torneoSlug: string }> }

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])

export default async function TorneoPublicoPage(props: Props) {
  const { slug, torneoSlug } = await props.params
  const tenant = await getPublicTenant(slug)
  if (!tenant || UNAVAILABLE.has(tenant.status)) notFound()

  // null cubre los cuatro casos por igual (no existe / no es público / es
  // borrador / flag apagado): que un torneo exista sin estar publicado tampoco
  // se filtra por la diferencia entre un 404 y un 403.
  const view = await getPublicTournamentView(tenant.id, torneoSlug)
  if (!view) notFound()

  const { card } = view

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        data={buildBreadcrumbList([
          { name: 'Inicio', url: absoluteUrl('/') },
          { name: tenant.name, url: absoluteUrl(`/${tenant.slug}`) },
          { name: 'Torneos', url: absoluteUrl(`/${tenant.slug}/torneos`) },
          { name: card.name, url: absoluteUrl(`/${tenant.slug}/torneos/${card.slug}`) },
        ])}
      />

      <Link
        href={`/${tenant.slug}/torneos`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Torneos de {tenant.name}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{card.name}</h1>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(card.status)}`}
          >
            {STATUS_LABELS[card.status]}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {FORMAT_SHORT[card.format]} · {formatDateRange(card.startsOn, card.endsOn)} ·{' '}
          {card.teamCount} {card.teamCount === 1 ? 'equipo' : 'equipos'}
        </p>
      </header>

      <TorneoPublicView view={view} />

      {/* Sin fixture ni tabla las tres secciones se ocultan solas; sin esto la
          página quedaría con el header y nada más. */}
      {view.matches.length === 0 && view.standings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          El fixture todavía no está publicado.
        </p>
      ) : null}
    </div>
  )
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug, torneoSlug } = await props.params
  const tenant = await getPublicTenant(slug)
  if (!tenant) return {}

  const view = await getPublicTournamentView(tenant.id, torneoSlug)
  // Sin ficha no hay qué indexar: la página va a devolver 404 igual.
  if (!view) return buildMetadata({
    title: `Torneo — ${tenant.name}`,
    description: `Torneos de ${tenant.name}.`,
    path: `/${tenant.slug}/torneos/${torneoSlug}`,
    noIndex: true,
  })

  return buildMetadata({
    title: `${view.card.name} — ${tenant.name}`,
    description: `Tabla de posiciones, fixture y goleadores de ${view.card.name} en ${tenant.name}, ${tenant.city}.`,
    path: `/${tenant.slug}/torneos/${view.card.slug}`,
    noIndex: UNAVAILABLE.has(tenant.status),
  })
}
