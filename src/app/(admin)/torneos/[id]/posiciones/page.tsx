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
import { listStages } from '@/modules/tournaments/tournament-fixture.service'
import { listTeams } from '@/modules/tournaments/tournament-team.service'
import {
  getDisciplineBoard,
  getStandings,
  getTopScorers,
} from '@/modules/tournaments/tournament-standings.service'
import { TournamentNotFoundError } from '@/modules/tournaments/tournament.errors'
import { FORMAT_SHORT, formatDateRange } from '../../torneos-lib'
import { TorneoTabs } from '../TorneoTabs'
import { PosicionesTable } from './PosicionesTable'
import { GoleadoresTable } from './GoleadoresTable'
import { SuspendidosPanel, type SuspendidoView } from './SuspendidosPanel'

export default async function TorneoPosicionesPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  let data
  try {
    data = await withTenantContext(tenant.id, async (tx) => {
      const tournament = await getTournament(tenant.id, id, tx)
      const [groups, scorers, discipline, stages, teams] = await Promise.all([
        getStandings(tenant.id, id, tx),
        getTopScorers(tenant.id, id, tx),
        getDisciplineBoard(tenant.id, id, tx),
        listStages(tenant.id, id, tx),
        listTeams(tenant.id, id, tx),
      ])
      return { tournament, groups, scorers, discipline, stages, teams }
    })
  } catch (err) {
    if (err instanceof TournamentNotFoundError) notFound()
    throw err
  }

  const { tournament, groups, scorers, discipline, stages, teams } = data

  // Los nombres de jugador y equipo no salen del motor (es puro y no conoce la
  // DB): se resuelven acá contra el plantel y los goleadores ya cargados.
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))
  const playerNameById = new Map(scorers.rows.map((r) => [r.teamPlayerId, r.playerName]))
  const suspendidos: SuspendidoView[] = discipline.map((row) => ({
    ...row,
    playerName: playerNameById.get(row.teamPlayerId) ?? 'Jugador',
    teamName: teamNameById.get(row.teamId) ?? 'Equipo',
  }))

  const groupStage = stages.find((s) => s.kind === 'group_stage')

  return (
    <div className="space-y-6 p-6">
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
      />

      <TorneoTabs
        tournamentId={tournament.id}
        active={`/torneos/${tournament.id}/posiciones`}
      />

      <PosicionesTable
        groups={groups}
        advancePerGroup={groupStage?.teamsAdvancePerGroup ?? null}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GoleadoresTable scorers={scorers} />
        <SuspendidosPanel rows={suspendidos} />
      </div>
    </div>
  )
}
