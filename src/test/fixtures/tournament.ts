import type {
  TournamentMatchView,
  TournamentRow,
  TournamentSlotRow,
  TournamentStageRow,
  TournamentTeamPlayerRow,
  TournamentTeamRow,
} from '@/modules/tournaments/tournament.types'
import { daysFromNow, hoursFromNow } from './clock'
import { uid } from './ids'
import { courtFutbol5 } from './court'
import { player } from './player'
import { tenant } from './tenant'

/**
 * Fixtures del módulo Torneos (migr. 062/063).
 *
 * Los `*.service.ts` son server-only y NO se importan acá ni en las stories;
 * los TIPOS sí (`tournament.types.ts` no importa nada de servidor), mismo
 * patrón que `canteen.ts`. Rangos de ids: 2001-2099 tournaments,
 * 2101-2199 tournament_teams, 2201-2299 tournament_team_players (ver `ids.ts`).
 */

/** Fecha ISO (YYYY-MM-DD) a N días de hoy — las fechas del torneo son strings. */
const isoDay = (days: number): string => daysFromNow(days).toISOString().slice(0, 10)

/** Liga de sábados ya en curso: el caso más común de un complejo. */
export const tournament = (overrides: Partial<TournamentRow> = {}): TournamentRow => ({
  id: uid(2001),
  tenantId: tenant().id,
  name: 'Clausura 2026',
  slug: 'clausura-2026',
  format: 'league',
  status: 'in_progress',
  startsOn: isoDay(-21),
  endsOn: isoDay(35),
  registrationDeadline: isoDay(-28),
  maxTeams: 12,
  matchDurationMinutes: 60,
  restBetweenMatchesMinutes: 0,
  inscriptionFee: 4_500_000, // $45.000
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['goal_diff', 'goals_for', 'head_to_head', 'fair_play', 'drawn_lots'],
  yellowCardsForSuspension: 3,
  redCardSuspensionMatches: 1,
  walkoverGoalsFor: 3,
  isPublic: false,
  notes: null,
  createdByStaff: null,
  createdAt: hoursFromNow(-600),
  updatedAt: hoursFromNow(-24),
  ...overrides,
})

/** Recién creado: sin horarios tomados ni equipos. El estado del alta. */
export const tournamentDraft = (): TournamentRow =>
  tournament({
    id: uid(2002),
    name: 'Copa de Verano',
    slug: 'copa-de-verano',
    status: 'draft',
    startsOn: isoDay(14),
    endsOn: null,
    registrationDeadline: null,
    maxTeams: null,
    inscriptionFee: 0,
  })

/** Relámpago de un día: partidos cortos, varias canchas en paralelo. */
export const tournamentRelampago = (): TournamentRow =>
  tournament({
    id: uid(2003),
    name: 'Relámpago Aniversario',
    slug: 'relampago-aniversario',
    format: 'groups_playoff',
    status: 'registration',
    startsOn: isoDay(10),
    endsOn: isoDay(10),
    maxTeams: 8,
    matchDurationMinutes: 25,
    restBetweenMatchesMinutes: 5,
  })

/** Cupo de 2 para poder mostrar el estado "lleno" sin cargar 12 equipos. */
export const tournamentLleno = (): TournamentRow =>
  tournament({ id: uid(2004), name: 'Copa Chica', slug: 'copa-chica', maxTeams: 2 })

export const tournamentTeam = (
  overrides: Partial<TournamentTeamRow> = {},
): TournamentTeamRow => ({
  id: uid(2101),
  tenantId: tenant().id,
  tournamentId: tournament().id,
  name: 'Los Pibes',
  contactPlayerId: null,
  contactName: 'Juan Pérez',
  contactPhone: '+54 9 11 5555-1234',
  status: 'registered',
  groupLabel: null,
  seed: null,
  notes: null,
  createdAt: hoursFromNow(-500),
  updatedAt: hoursFromNow(-500),
  ...overrides,
})

/** Capitán vinculado a una cuenta real: el 20% que sí rinde del CRM. */
export const tournamentTeamVinculado = (): TournamentTeamRow =>
  tournamentTeam({
    id: uid(2102),
    name: 'Real Sociedad de Fútbol',
    contactPlayerId: player().id,
    contactName: 'Tomás Rodríguez',
    status: 'confirmed',
  })

export const tournamentTeamBajado = (): TournamentTeamRow =>
  tournamentTeam({ id: uid(2103), name: 'Los Amigos', status: 'withdrawn' })

export const tournamentTeamDescalificado = (): TournamentTeamRow =>
  tournamentTeam({
    id: uid(2104),
    name: 'Barrio Norte',
    status: 'disqualified',
    notes: 'Se presentó con jugadores no inscriptos.',
  })

/** Plantel típico: 6 equipos con nombres reconocibles para las stories. */
export const tournamentTeams = (): TournamentTeamRow[] => [
  tournamentTeam(),
  tournamentTeamVinculado(),
  tournamentTeam({ id: uid(2105), name: 'Atlético Fondo', contactName: 'Nico' }),
  tournamentTeam({ id: uid(2106), name: 'FC Cerveza', contactName: 'Mati', contactPhone: null }),
  tournamentTeamBajado(),
  tournamentTeamDescalificado(),
]

export const tournamentTeamPlayer = (
  overrides: Partial<TournamentTeamPlayerRow> = {},
): TournamentTeamPlayerRow => ({
  id: uid(2201),
  tenantId: tenant().id,
  teamId: tournamentTeam().id,
  fullName: 'Juan Pérez',
  playerId: null,
  dni: null,
  shirtNumber: 10,
  createdAt: hoursFromNow(-480),
  updatedAt: hoursFromNow(-480),
  ...overrides,
})

/** Plantel híbrido: nombres sueltos y uno solo enganchado a una cuenta. */
export const tournamentRoster = (): TournamentTeamPlayerRow[] => [
  tournamentTeamPlayer(),
  tournamentTeamPlayer({
    id: uid(2202),
    fullName: 'Tomás Rodríguez',
    playerId: player().id,
    shirtNumber: 7,
  }),
  tournamentTeamPlayer({ id: uid(2203), fullName: 'Nicolás Gómez', shirtNumber: 4 }),
  tournamentTeamPlayer({ id: uid(2204), fullName: 'Matías Sosa', shirtNumber: null }),
]

/**
 * Horas que el torneo posee. Una fila por hora y cancha, que es como las
 * materializa `reserveTournamentSlots`.
 */
export const tournamentSlot = (
  overrides: Partial<TournamentSlotRow> = {},
): TournamentSlotRow => ({
  bookingId: uid(1801),
  courtId: courtFutbol5().id,
  date: isoDay(7),
  timeStart: '14:00',
  timeEnd: '15:00',
  startsAt: hoursFromNow(24 * 7),
  endsAt: hoursFromNow(24 * 7 + 1),
  ...overrides,
})

// ─── Fixture (migr. 064) ────────────────────────────────────────────
// Rango de ids: 2301-2399 stages, 2401-2499 matches.

export const tournamentStage = (
  overrides: Partial<TournamentStageRow> = {},
): TournamentStageRow => ({
  id: uid(2301),
  tenantId: tenant().id,
  tournamentId: tournament().id,
  name: 'Liga',
  kind: 'league',
  orderIndex: 0,
  legs: 1,
  groupsCount: null,
  teamsAdvancePerGroup: null,
  createdAt: hoursFromNow(-72),
  updatedAt: hoursFromNow(-72),
  ...overrides,
})

export const tournamentMatch = (
  overrides: Partial<TournamentMatchView> = {},
): TournamentMatchView => ({
  id: uid(2401),
  tenantId: tenant().id,
  tournamentId: tournament().id,
  stageId: tournamentStage().id,
  round: 1,
  groupLabel: null,
  bracketSlot: null,
  homeTeamId: tournamentTeam().id,
  awayTeamId: uid(2105),
  homeSourceMatchId: null,
  awaySourceMatchId: null,
  isThirdPlace: false,
  courtId: courtFutbol5().id,
  bookingId: uid(1801),
  startsAt: hoursFromNow(24),
  endsAt: hoursFromNow(25),
  status: 'scheduled',
  homeScore: null,
  awayScore: null,
  playedAt: null,
  notes: null,
  createdAt: hoursFromNow(-72),
  updatedAt: hoursFromNow(-72),
  homeTeamName: 'Los Pibes',
  awayTeamName: 'Atlético Fondo',
  courtName: courtFutbol5().name,
  ...overrides,
})

/** Fecha 1 completa: uno jugado, uno programado y uno sin agendar. */
export const tournamentFixture = (): TournamentMatchView[] => [
  tournamentMatch({
    id: uid(2401),
    status: 'played',
    homeScore: 3,
    awayScore: 1,
    playedAt: hoursFromNow(-2),
  }),
  tournamentMatch({
    id: uid(2402),
    homeTeamName: 'Real Sociedad de Fútbol',
    awayTeamName: 'FC Cerveza',
    homeTeamId: uid(2102),
    awayTeamId: uid(2106),
    startsAt: hoursFromNow(25),
    endsAt: hoursFromNow(26),
  }),
  tournamentMatch({
    id: uid(2403),
    round: 2,
    homeTeamName: 'Los Pibes',
    awayTeamName: 'FC Cerveza',
    awayTeamId: uid(2106),
    // Sin agendar: no entró en las horas tomadas.
    startsAt: null,
    endsAt: null,
    bookingId: null,
    courtId: null,
    courtName: null,
  }),
]

/** Un sábado de 14 a 18 en una cancha: 4 horas seguidas. */
export const tournamentSlots = (): TournamentSlotRow[] =>
  ['14:00', '15:00', '16:00', '17:00'].map((timeStart, i) =>
    tournamentSlot({
      bookingId: uid(1801 + i),
      timeStart,
      timeEnd: `${String(Number(timeStart.slice(0, 2)) + 1).padStart(2, '0')}:00`,
      startsAt: hoursFromNow(24 * 7 + i),
      endsAt: hoursFromNow(24 * 7 + i + 1),
    }),
  )
