import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ChevronLeft, ChevronRight, Sparkles, Trophy } from 'lucide-react'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { listPublicTournaments } from '@/modules/tournaments/tournament-public.service'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import { buildBreadcrumbList } from '@/lib/seo/structured-data'
import JsonLd from '@/components/seo/JsonLd'
import {
  FORMAT_SHORT,
  STATUS_LABELS,
  formatArs,
  formatDateRange,
  statusBadgeClass,
} from '@/app/(admin)/torneos/torneos-lib'

// El listado depende de datos que cambian cuando el complejo publica o
// despublica un torneo: 5 min de ISR, igual que el perfil.
export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])

export default async function TorneosPublicosPage(props: Props) {
  const { slug } = await props.params
  const tenant = await getPublicTenant(slug)
  if (!tenant || UNAVAILABLE.has(tenant.status)) notFound()

  // Devuelve [] si el complejo tiene el flag apagado: la página existe pero
  // queda vacía, sin filtrar que el módulo no está habilitado.
  const tournaments = await listPublicTournaments(tenant.id)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        data={buildBreadcrumbList([
          { name: 'Inicio', url: absoluteUrl('/') },
          { name: tenant.name, url: absoluteUrl(`/${tenant.slug}`) },
          { name: 'Torneos', url: absoluteUrl(`/${tenant.slug}/torneos`) },
        ])}
      />

      <Link
        href={`/${tenant.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {tenant.name}
      </Link>

      <h1 className="text-xl font-bold tracking-tight text-foreground">Torneos</h1>

      {tournaments.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-linear-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-6 text-center sm:p-8">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <Trophy className="h-7 w-7 text-emerald-500" />
          </div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            Próximamente
          </div>
          <h2 className="text-lg font-bold text-foreground">Módulo de Torneos</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground leading-relaxed">
            {tenant.name} estará publicando los próximos torneos, tablas de posiciones y fixtures
            muy pronto.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tournaments.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/${tenant.slug}/torneos/${t.slug}`}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{t.name}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(t.status)}`}
                    >
                      {STATUS_LABELS[t.status]}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {FORMAT_SHORT[t.format]} · {formatDateRange(t.startsOn, t.endsOn)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {t.teamCount} {t.teamCount === 1 ? 'equipo' : 'equipos'}
                    {t.maxTeams !== null ? ` de ${t.maxTeams}` : ''}
                    {t.inscriptionFee > 0 ? ` · Inscripción ${formatArs(t.inscriptionFee)}` : ''}
                  </p>
                </div>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params
  const tenant = await getPublicTenant(slug)
  if (!tenant) return {}
  return buildMetadata({
    title: `Torneos — ${tenant.name}`,
    description: `Tabla de posiciones, fixture y goleadores de los torneos de ${tenant.name}, ${tenant.city}.`,
    path: `/${tenant.slug}/torneos`,
    noIndex: UNAVAILABLE.has(tenant.status),
  })
}
