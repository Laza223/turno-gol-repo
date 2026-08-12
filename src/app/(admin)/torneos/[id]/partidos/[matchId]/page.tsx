import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { getTournament } from '@/modules/tournaments/tournament.service'
import { listFixture, listStages } from '@/modules/tournaments/tournament-fixture.service'
import { listMatchEvents } from '@/modules/tournaments/tournament-result.service'
import { getDisciplineBoard } from '@/modules/tournaments/tournament-standings.service'
import { listTeamPlayers, listTeams } from '@/modules/tournaments/tournament-team.service'
import { TournamentNotFoundError } from '@/modules/tournaments/tournament.errors'
import {
  addMatchEventAction,
  clearMatchResultAction,
  deleteMatchEventAction,
  markWalkoverAction,
  saveMatchResultAction,
} from '../../../actions'
import { formatMatchWhen } from '../../../torneos-lib'
import { ActaPanel, type ActaRoster } from './ActaPanel'

export default async function ActaPartidoPage(props: {
  params: Promise<{ id: string; matchId: string }>
}) {
  const { id, matchId } = await props.params

  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant } = auth

  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  let data
  try {
    data = await withTenantContext(tenant.id, async (tx) => {
      const tournament = await getTournament(tenant.id, id, tx)
      const [matches, stages, events, discipline, teams] = await Promise.all([
        listFixture(tenant.id, id, tx),
        listStages(tenant.id, id, tx),
        listMatchEvents(tenant.id, matchId, tx),
        getDisciplineBoard(tenant.id, id, tx),
        listTeams(tenant.id, id, tx),
      ])
      const match = matches.find((m) => m.id === matchId)
      if (!match) return null

      // Solo los planteles de los dos equipos del partido.
      const rosters: ActaRoster[] = []
      for (const teamId of [match.homeTeamId, match.awayTeamId]) {
        if (teamId === null) continue
        const team = teams.find((t) => t.id === teamId)
        rosters.push({
          teamId,
          teamName: team?.name ?? 'Equipo',
          players: await listTeamPlayers(tenant.id, teamId, tx),
        })
      }

      return { tournament, match, stages, events, discipline, rosters }
    })
  } catch (err) {
    if (err instanceof TournamentNotFoundError) notFound()
    throw err
  }

  if (!data) notFound()
  const { tournament, match, stages, events, discipline, rosters } = data

  const stageKind = stages.find((s) => s.id === match.stageId)?.kind ?? 'league'
  const suspendedPlayerIds = discipline
    .filter((r) => r.pendingMatches > 0)
    .map((r) => r.teamPlayerId)

  return (
    <div className="space-y-6 p-6">
      <Link
        href={`/torneos/${tournament.id}/fixture`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al fixture
      </Link>

      <PageHeader
        title={`${match.homeTeamName ?? 'A definir'} vs ${match.awayTeamName ?? 'A definir'}`}
        subtitle={`${tournament.name} · ${formatMatchWhen(match.startsAt)}`}
        icon={<Trophy className="h-6 w-6" aria-hidden="true" />}
      />

      <ActaPanel
        match={match}
        stageKind={stageKind}
        events={events}
        rosters={rosters}
        suspendedPlayerIds={suspendedPlayerIds}
        saveResultAction={saveMatchResultAction}
        walkoverAction={markWalkoverAction}
        clearResultAction={clearMatchResultAction}
        addEventAction={addMatchEventAction}
        deleteEventAction={deleteMatchEventAction}
      />
    </div>
  )
}
