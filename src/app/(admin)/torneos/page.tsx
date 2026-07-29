import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Plus, Sparkles, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { listTournaments } from '@/modules/tournaments/tournament.service'
import {
  FORMAT_SHORT,
  STATUS_LABELS,
  formatDateRange,
  statusBadgeClass,
} from './torneos-lib'

export default async function TorneosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  // La ruta también está detrás del flag: esconder el item del menú no alcanza,
  // alguien puede entrar por URL.
  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  const tournaments = await withTenantContext(tenant.id, (tx) =>
    listTournaments(tenant.id, tx),
  )

  const total = tournaments.length

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Torneos"
        subtitle={total === 1 ? '1 torneo' : `${total} torneos`}
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
        actions={
          <Link
            href="/torneos/nuevo"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo torneo
          </Link>
        }
      />

      {/* Banner Próximamente */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-linear-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-6 sm:p-8 dark:from-emerald-500/15 dark:via-teal-500/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              Próximamente
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Módulo de Torneos
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Muy pronto vas a poder crear torneos, administrar equipos, armar el fixture automático y compartir la tabla de posiciones con los jugadores.
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20">
            <Trophy className="h-10 w-10 text-emerald-500" />
          </div>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Todavía no hay torneos"
          description="Creá un torneo para reservarle los horarios en la grilla, anotar los equipos y armar el fixture."
          action={
            <Link
              href="/torneos/nuevo"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear el primero
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link
                href={`/torneos/${t.id}`}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{t.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {FORMAT_SHORT[t.format]} · {formatDateRange(t.startsOn, t.endsOn)}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(t.status)}`}
                >
                  {STATUS_LABELS[t.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
