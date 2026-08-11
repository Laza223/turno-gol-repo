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
import { listFixture, listStages } from '@/modules/tournaments/tournament-fixture.service'
import { listTeams } from '@/modules/tournaments/tournament-team.service'
import {
  getDisciplineBoard,
  getStandings,
  getTopScorers,
} from '@/modules/tournaments/tournament-standings.service'
import {
  qualifiedSeeds,
  qualifierLabel,
  type QualifiedSeed,
} from '@/modules/tournaments/standings/bracket'
import {
  StandingsTieUnresolvedError,
  TournamentNotFoundError,
} from '@/modules/tournaments/tournament.errors'
import { getStaffRole } from '@/modules/staff/staff.service'
import { seedPlayoffsAction, updateTeamAction } from '../../actions'
import { FORMAT_SHORT, formatDateRange } from '../../torneos-lib'
import { TorneoTabs } from '../TorneoTabs'
import { CorteZonasCard, type CrossPreview, type TiedTeam } from './CorteZonasCard'
import { PosicionesTable } from './PosicionesTable'
import { GoleadoresTable } from './GoleadoresTable'
import { SuspendidosPanel, type SuspendidoView } from './SuspendidosPanel'

import type { StandingsGroup } from '@/modules/tournaments/standings/types'
import type {
  TournamentMatchView,
  TournamentRow,
  TournamentStageRow,
  TournamentTeamRow,
} from '@/modules/tournaments/tournament.types'

export default async function TorneoPosicionesPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  if (!(await isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id))) notFound()

  // El corte es configuración (solo el dueño lo puede cerrar), pero el estado
  // lo ve todo el staff: por eso el rol se lee acá y no se esconde la tarjeta.
  const role = await getStaffRole(tenant.id, user.staffUserId)

  let data
  try {
    data = await withTenantContext(tenant.id, async (tx) => {
      const tournament = await getTournament(tenant.id, id, tx)
      const [groups, scorers, discipline, stages, teams, matches] = await Promise.all([
        getStandings(tenant.id, id, tx),
        getTopScorers(tenant.id, id, tx),
        getDisciplineBoard(tenant.id, id, tx),
        listStages(tenant.id, id, tx),
        listTeams(tenant.id, id, tx),
        listFixture(tenant.id, id, tx),
      ])
      return { tournament, groups, scorers, discipline, stages, teams, matches }
    })
  } catch (err) {
    if (err instanceof TournamentNotFoundError) notFound()
    throw err
  }

  const { tournament, groups, scorers, discipline, stages, teams, matches } = data

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
  const corte = buildCorte({ tournament, stages, groups, teams, matches })

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

      {corte && (
        <CorteZonasCard
          tournamentId={tournament.id}
          pendingGroupMatches={corte.pendingGroupMatches}
          crosses={corte.crosses}
          tie={corte.tie}
          alreadySeeded={corte.alreadySeeded}
          canSeed={role === 'admin'}
          seedAction={seedPlayoffsAction}
          updateTeamAction={updateTeamAction}
        />
      )}

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

/**
 * El estado del corte, calculado en el servidor.
 *
 * `qualifiedSeeds` es puro pero vive en el motor de standings: se corre acá
 * para no arrastrarlo al bundle del cliente y, sobre todo, porque tira
 * `StandingsTieUnresolvedError` — atraparlo en el servidor es lo que permite
 * mostrar el sorteo de desempate en vez de un cuadro a medias.
 *
 * Devuelve `null` cuando el corte no aplica: solo existe en torneos de zonas
 * con fase de playoffs y fixture generado.
 */
function buildCorte({
  tournament,
  stages,
  groups,
  teams,
  matches,
}: {
  tournament: TournamentRow
  stages: TournamentStageRow[]
  groups: StandingsGroup[]
  teams: TournamentTeamRow[]
  matches: TournamentMatchView[]
}): {
  pendingGroupMatches: number
  crosses: CrossPreview[]
  tie: { groupLabel: string; teams: TiedTeam[] } | null
  alreadySeeded: boolean
} | null {
  if (tournament.format !== 'groups_playoff') return null
  const groupStage = stages.find((s) => s.kind === 'group_stage')
  const knockoutStage = stages.find((s) => s.kind === 'knockout')
  if (!groupStage || !knockoutStage) return null

  // Mismo criterio que `seedPlayoffs`: un partido de zona cuenta como cerrado
  // si se jugó, fue walkover o se canceló.
  const pendingGroupMatches = matches.filter(
    (m) =>
      m.stageId === groupStage.id &&
      m.status !== 'played' &&
      m.status !== 'walkover' &&
      m.status !== 'canceled',
  ).length

  let qualified: QualifiedSeed[] = []
  let tie: { groupLabel: string; teams: TiedTeam[] } | null = null
  try {
    qualified = qualifiedSeeds(groups, groupStage.teamsAdvancePerGroup ?? 2)
  } catch (err) {
    if (!(err instanceof StandingsTieUnresolvedError)) throw err
    // El error trae nombres, no ids: los equipos empatados se reconstruyen
    // contra la tabla, que es de donde salieron esos nombres.
    const seedByTeamId = new Map(teams.map((t) => [t.id, t.seed]))
    const rows =
      groups.find((g) => (g.groupLabel ?? '') === err.groupLabel)?.rows ?? []
    tie = {
      groupLabel: err.groupLabel,
      teams: rows
        .filter((r) => err.teamNames.includes(r.teamName))
        .map((r) => ({
          teamId: r.teamId,
          teamName: r.teamName,
          seed: seedByTeamId.get(r.teamId) ?? null,
        })),
    }
  }

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))
  const nameOfSeed = (seed: number | null): string | null => {
    if (seed === null) return null
    const q = qualified.find((s) => s.seed === seed)
    return q ? (teamNameById.get(q.teamId) ?? null) : null
  }

  const knockoutRounds = matches
    .filter((m) => m.stageId === knockoutStage.id)
    .map((m) => m.round)
  const firstRound = knockoutRounds.length > 0 ? Math.min(...knockoutRounds) : 0

  // Los cruces que se siembran son los de la primera ronda: el resto sale de
  // los ganadores, no de las zonas.
  const crosses: CrossPreview[] = matches
    .filter(
      (m) =>
        m.stageId === knockoutStage.id &&
        m.round === firstRound &&
        (m.homeSourceSeed !== null || m.awaySourceSeed !== null),
    )
    .sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0))
    .map((m) => ({
      id: m.id,
      homeLabel:
        m.homeSourceSeed !== null
          ? qualifierLabel(m.homeSourceSeed, groupStage.groupsCount ?? 0)
          : 'A definir',
      // Si el cuadro ya está sembrado, el nombre real sale del propio partido.
      homeTeamName: m.homeTeamName ?? nameOfSeed(m.homeSourceSeed),
      awayLabel:
        m.awaySourceSeed !== null
          ? qualifierLabel(m.awaySourceSeed, groupStage.groupsCount ?? 0)
          : 'A definir',
      awayTeamName: m.awayTeamName ?? nameOfSeed(m.awaySourceSeed),
    }))

  if (crosses.length === 0) return null

  const alreadySeeded = matches.some(
    (m) => m.stageId === knockoutStage.id && m.round === firstRound && m.homeTeamId !== null,
  )

  return { pendingGroupMatches, crosses, tie, alreadySeeded }
}
