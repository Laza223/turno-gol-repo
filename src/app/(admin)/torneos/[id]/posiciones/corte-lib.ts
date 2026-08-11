import {
  qualifiedSeeds,
  qualifierLabel,
  type QualifiedSeed,
} from '@/modules/tournaments/standings/bracket'
import type { StandingsGroup } from '@/modules/tournaments/standings/types'
import { StandingsTieUnresolvedError } from '@/modules/tournaments/tournament.errors'
import type {
  TournamentMatchView,
  TournamentRow,
  TournamentStageRow,
  TournamentTeamRow,
} from '@/modules/tournaments/tournament.types'
import { roundLabel } from '../../torneos-lib'

/**
 * El estado del corte de zonas, derivado de lo que la página ya tiene cargado.
 *
 * Vive acá y no adentro de `page.tsx` para que se pueda testear: la primera
 * versión filtraba los cruces por "la primera ronda del cuadro" y eso borraba
 * de la pantalla a los dos equipos con BYE — un torneo de 3 zonas con 2
 * clasificados por zona da 6 clasificados, y los seeds 1 y 2 entran recién en
 * la ronda 2. La siembra real los sembraba bien; la vista previa no los
 * mostraba nunca. Un helper suelto adentro de un `page.tsx` no tiene cómo
 * tener un test que lo agarre.
 *
 * Puro: sin DB, sin React. Es el mismo criterio que `torneos-lib.ts`.
 */

/** Un cruce del cuadro que se alimenta de un puesto de zona. */
export type CrossPreview = {
  id: string
  /** 'Cuartos de final', 'Semifinal'… Se muestra si el cuadro tiene BYE. */
  round: string
  homeLabel: string
  homeTeamName: string | null
  awayLabel: string
  awayTeamName: string | null
}

export type TiedTeam = {
  teamId: string
  teamName: string
  seed: number | null
}

export type CorteState = {
  pendingGroupMatches: number
  crosses: CrossPreview[]
  tie: { groupLabel: string; teams: TiedTeam[] } | null
  alreadySeeded: boolean
}

export type CorteInput = {
  tournament: TournamentRow
  stages: TournamentStageRow[]
  groups: StandingsGroup[]
  teams: TournamentTeamRow[]
  matches: TournamentMatchView[]
}

/**
 * Devuelve `null` cuando el corte no aplica: solo existe en torneos de zonas
 * con fase de playoffs y fixture ya generado.
 *
 * `qualifiedSeeds` es puro pero **tira** `StandingsTieUnresolvedError`: correrlo
 * acá (en el servidor) es lo que permite ofrecer el sorteo de desempate en vez
 * de dibujar un cuadro a medias.
 */
export function buildCorte({
  tournament,
  stages,
  groups,
  teams,
  matches,
}: CorteInput): CorteState | null {
  if (tournament.format !== 'groups_playoff') return null
  // Mismo `find` y mismo orden (`listStages` ordena por `order_index`) que
  // `loadSeedContext`, para no mirar una fase distinta de la que se siembra.
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
  let tie: CorteState['tie'] = null
  try {
    qualified = qualifiedSeeds(groups, groupStage.teamsAdvancePerGroup ?? 2)
  } catch (err) {
    if (!(err instanceof StandingsTieUnresolvedError)) throw err
    // El error trae nombres, no ids: los equipos empatados se reconstruyen
    // contra la tabla, que es de donde salieron esos nombres.
    const seedByTeamId = new Map(teams.map((t) => [t.id, t.seed]))
    const tiedNames = new Set(err.teamNames)
    const rows = groups.find((g) => (g.groupLabel ?? '') === err.groupLabel)?.rows ?? []
    const tiedTeams: TiedTeam[] = []
    for (const row of rows) {
      if (!tiedNames.has(row.teamName)) continue
      tiedTeams.push({
        teamId: row.teamId,
        teamName: row.teamName,
        seed: seedByTeamId.get(row.teamId) ?? null,
      })
    }
    tie = { groupLabel: err.groupLabel, teams: tiedTeams }
  }

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))
  const nameOfSeed = (seed: number | null): string | null => {
    if (seed === null) return null
    const q = qualified.find((s) => s.seed === seed)
    return q ? (teamNameById.get(q.teamId) ?? null) : null
  }

  const knockoutMatches = matches.filter((m) => m.stageId === knockoutStage.id)
  const totalRounds = knockoutMatches.reduce((max, m) => Math.max(max, m.round), 0)

  /**
   * Un lado que no sale de una zona sale del ganador de otra llave. Decirlo así
   * y no "A definir" es lo que hace legible un cuadro con BYE: el equipo con
   * bye espera a alguien, no está sin definir.
   */
  const sideLabel = (sourceSeed: number | null, sourceMatchId: string | null): string => {
    if (sourceSeed !== null) return qualifierLabel(sourceSeed, groupStage.groupsCount ?? 0)
    return sourceMatchId !== null ? 'Ganador de la llave anterior' : 'A definir'
  }

  // TODOS los cruces alimentados por un puesto de zona, no solo los de la
  // primera ronda: con BYE, los mejores clasificados entran una ronda después
  // y son justamente los que más interesa ver.
  const crosses: CrossPreview[] = knockoutMatches
    .filter((m) => m.homeSourceSeed !== null || m.awaySourceSeed !== null)
    .sort((a, b) => a.round - b.round || (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0))
    .map((m) => ({
      id: m.id,
      round: roundLabel(m.round, 'knockout', totalRounds),
      homeLabel: sideLabel(m.homeSourceSeed, m.homeSourceMatchId),
      // Si el cuadro ya está sembrado, el nombre real sale del propio partido.
      homeTeamName: m.homeTeamName ?? nameOfSeed(m.homeSourceSeed),
      awayLabel: sideLabel(m.awaySourceSeed, m.awaySourceMatchId),
      awayTeamName: m.awayTeamName ?? nameOfSeed(m.awaySourceSeed),
    }))

  if (crosses.length === 0) return null

  // Cualquier lado con equipo alcanza: `applySeeding` escribe home Y away según
  // el seed de cada uno, y en un cruce con BYE el sembrado puede ser el visitante.
  const alreadySeeded = knockoutMatches.some((m) => m.homeTeamId !== null || m.awayTeamId !== null)

  return { pendingGroupMatches, crosses, tie, alreadySeeded }
}
