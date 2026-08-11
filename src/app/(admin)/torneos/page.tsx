import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Plus, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { listTournaments } from '@/modules/tournaments/tournament.service'
import { FORMAT_SHORT, STATUS_LABELS, formatDateRange, statusBadgeClass } from './torneos-lib'

export default async function TorneosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  // La ruta también está detrás del flag: esconder el item del menú no alcanza,
  // alguien puede entrar por URL.
  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  // Crear un torneo es configuración: solo el dueño (mismo criterio que
  // /torneos/nuevo, que ya rebota server-side al manager). Acá solo ocultamos
  // el botón para no mandarlo a un rebote sin explicación.
  const role = await getStaffRole(tenant.id, user.staffUserId)

  const tournaments = await withTenantContext(tenant.id, (tx) => listTournaments(tenant.id, tx))

  const total = tournaments.length

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Torneos"
        subtitle={total === 1 ? '1 torneo' : `${total} torneos`}
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
        actions={
          role === 'admin' ? (
            <Link
              href="/torneos/nuevo"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo torneo
            </Link>
          ) : undefined
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Todavía no hay torneos"
          description="Creá un torneo para reservarle los horarios en la grilla, anotar los equipos y armar el fixture."
          action={
            <Link
              href="/torneos/nuevo"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear el primero
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {tournaments.map((t, i) => (
            // Delay capeado: sin cota, en listas largas los últimos ítems quedan
            // invisibles (opacity 0) más de un segundo aunque ya sean focuseables.
            <li
              key={t.id}
              className="card-entrance"
              style={{ animationDelay: `${80 + Math.min(i, 8) * 50}ms` }}
            >
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
