import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { getTournament } from '@/modules/tournaments/tournament.service'
import { listTeams } from '@/modules/tournaments/tournament-team.service'
import { listTournamentSlots } from '@/modules/tournaments/tournament-slots.service'
import { TournamentNotFoundError } from '@/modules/tournaments/tournament.errors'
import { listCourts } from '@/modules/courts/court.service'
import {
  addTeamAction,
  releaseSlotsAction,
  removeTeamAction,
  reserveSlotsAction,
} from '../actions'
import {
  FORMAT_SHORT,
  STATUS_LABELS,
  formatArs,
  formatDateRange,
  statusBadgeClass,
} from '../torneos-lib'
import { SlotsPanel } from './SlotsPanel'
import { TeamsPanel } from './TeamsPanel'
import { TorneoTabs } from './TorneoTabs'

export default async function TorneoDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  // Todo en UNA transacción, en paralelo adentro.
  let data
  try {
    data = await withTenantContext(tenant.id, async (tx) => {
      const tournament = await getTournament(tenant.id, id, tx)
      const [teams, slots, courts] = await Promise.all([
        listTeams(tenant.id, id, tx),
        listTournamentSlots(tenant.id, id, tx),
        listCourts(tenant.id, tx),
      ])
      return { tournament, teams, slots, courts }
    })
  } catch (err) {
    if (err instanceof TournamentNotFoundError) notFound()
    throw err
  }

  const { tournament, teams, slots, courts } = data
  const courtNames = Object.fromEntries(courts.map((c) => [c.id, c.name]))

  return (
    <div className="p-6 space-y-6">
      <Link
        href="/torneos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a Torneos
      </Link>

      <PageHeader
        title={tournament.name}
        subtitle={`${FORMAT_SHORT[tournament.format]} · ${formatDateRange(tournament.startsOn, tournament.endsOn)}`}
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
        actions={
          <div className="flex items-center gap-3">
            {tournament.inscriptionFee > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                Inscripción {formatArs(tournament.inscriptionFee)}
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(tournament.status)}`}
            >
              {STATUS_LABELS[tournament.status]}
            </span>
          </div>
        }
      />

      <TorneoTabs tournamentId={tournament.id} active={`/torneos/${tournament.id}`} />

      <TeamsPanel
        tournamentId={tournament.id}
        teams={teams}
        maxTeams={tournament.maxTeams}
        addAction={addTeamAction}
        removeAction={removeTeamAction}
      />

      <SlotsPanel
        tournamentId={tournament.id}
        courts={courts.map((c) => ({ id: c.id, name: c.name }))}
        slots={slots}
        courtNames={courtNames}
        reserveAction={reserveSlotsAction}
        releaseAction={releaseSlotsAction}
      />
    </div>
  )
}
