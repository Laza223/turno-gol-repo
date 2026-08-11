// Errores de dominio del módulo Torneos. Mensajes en inglés: la traducción a
// es-AR vive en la Server Action (patrón canteen.errors.ts).

export class TournamentNotFoundError extends Error {
  constructor(public readonly tournamentId: string) {
    super(`Tournament '${tournamentId}' not found.`)
    this.name = 'TournamentNotFoundError'
  }
}

export class TournamentTeamNotFoundError extends Error {
  constructor(public readonly teamId: string) {
    super(`Tournament team '${teamId}' not found.`)
    this.name = 'TournamentTeamNotFoundError'
  }
}

/** Borrar un torneo solo se permite en 'draft'; después se cancela. */
export class TournamentNotDeletableError extends Error {
  constructor(public readonly status: string) {
    super(`A tournament in status '${status}' cannot be deleted, only canceled.`)
    this.name = 'TournamentNotDeletableError'
  }
}

/** El torneo todavía posee horas en la grilla: hay que liberarlas primero. */
export class TournamentHasBookingsError extends Error {
  constructor(public readonly bookingCount: number) {
    super(`Tournament still owns ${bookingCount} booked hour(s). Release them first.`)
    this.name = 'TournamentHasBookingsError'
  }
}

export class TournamentFullError extends Error {
  constructor(public readonly maxTeams: number) {
    super(`Tournament is full (${maxTeams} teams).`)
    this.name = 'TournamentFullError'
  }
}

export class DuplicateTeamNameError extends Error {
  constructor(public readonly teamName: string) {
    super(`A team named '${teamName}' is already registered in this tournament.`)
    this.name = 'DuplicateTeamNameError'
  }
}

export class DuplicateShirtNumberError extends Error {
  constructor(public readonly shirtNumber: number) {
    super(`Shirt number ${shirtNumber} is already taken in this team.`)
    this.name = 'DuplicateShirtNumberError'
  }
}

/** La cancha no existe, no es de este complejo, o está offline. */
export class TournamentCourtUnavailableError extends Error {
  constructor(public readonly courtId: string) {
    super(`Court '${courtId}' is unavailable for this tenant.`)
    this.name = 'TournamentCourtUnavailableError'
  }
}

export class TournamentSlotRangeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TournamentSlotRangeError'
  }
}

/** Ninguna de las horas pedidas quedó libre. */
export class NoSlotsReservedError extends Error {
  constructor(public readonly conflictCount: number) {
    super(`All ${conflictCount} requested hour(s) were already taken.`)
    this.name = 'NoSlotsReservedError'
  }
}

// ─── Fixture (migr. 064) ────────────────────────────────────────────

/** Mensaje YA en es-AR: lo arma el motor puro, que conoce el detalle. */
export class FixtureGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FixtureGenerationError'
  }
}

/** El torneo ya tiene fixture: hay que borrarlo antes de regenerar. */
export class FixtureAlreadyExistsError extends Error {
  constructor(public readonly matchCount: number) {
    super(`Tournament already has a fixture with ${matchCount} match(es).`)
    this.name = 'FixtureAlreadyExistsError'
  }
}

export class MatchNotFoundError extends Error {
  constructor(public readonly matchId: string) {
    super(`Match '${matchId}' not found.`)
    this.name = 'MatchNotFoundError'
  }
}

/** Se quiso mover un partido fuera de las horas que el torneo posee. */
export class MatchOutsideOwnedTimeError extends Error {
  constructor() {
    super('The match does not fit inside an hour owned by the tournament.')
    this.name = 'MatchOutsideOwnedTimeError'
  }
}

/** Un equipo quedaría con dos partidos al mismo tiempo. */
export class TeamDoubleBookedError extends Error {
  constructor(public readonly teamName: string) {
    super(`Team '${teamName}' would play two matches at the same time.`)
    this.name = 'TeamDoubleBookedError'
  }
}

/**
 * La cancha ya tiene otro partido a esa hora. El generador nunca produce esto
 * (un hueco recibe un solo partido), así que solo puede llegar por una
 * reprogramación manual.
 */
export class CourtSlotTakenError extends Error {
  constructor() {
    super('Another match already occupies that court at that time.')
    this.name = 'CourtSlotTakenError'
  }
}

// ─── Resultados y disciplina (migr. 065) ────────────────────────────

/** Se quiso cargar resultado en una llave que todavía no tiene equipos. */
export class MatchTeamsUndefinedError extends Error {
  constructor(public readonly matchId: string) {
    super(`Match '${matchId}' does not have both teams defined yet.`)
    this.name = 'MatchTeamsUndefinedError'
  }
}

export class MatchNotPlayableError extends Error {
  constructor(public readonly status: string) {
    super(`A match with status '${status}' cannot take a result.`)
    this.name = 'MatchNotPlayableError'
  }
}

/** Una llave no puede terminar empatada: alguien tiene que pasar. */
export class KnockoutTieUnresolvedError extends Error {
  constructor() {
    super('A knockout match cannot end in a draw without a penalty shootout.')
    this.name = 'KnockoutTieUnresolvedError'
  }
}

export class PenaltiesNotAllowedError extends Error {
  constructor() {
    super('Penalties can only be recorded on a drawn match.')
    this.name = 'PenaltiesNotAllowedError'
  }
}

export class WalkoverWinnerNotInMatchError extends Error {
  constructor(public readonly teamId: string) {
    super(`Team '${teamId}' does not play this match.`)
    this.name = 'WalkoverWinnerNotInMatchError'
  }
}

export class WalkoverNeedsWinnerError extends Error {
  constructor() {
    super('A knockout walkover needs a winner: someone has to advance.')
    this.name = 'WalkoverNeedsWinnerError'
  }
}

export class WalkoverWithEventsError extends Error {
  constructor(public readonly eventCount: number) {
    super(`The match already has ${eventCount} event(s) recorded.`)
    this.name = 'WalkoverWithEventsError'
  }
}

/** Corregir este partido cambiaría un partido posterior que ya se jugó. */
export class DownstreamMatchAlreadyPlayedError extends Error {
  constructor(public readonly matchId: string) {
    super(`Downstream match '${matchId}' already has a result.`)
    this.name = 'DownstreamMatchAlreadyPlayedError'
  }
}

export class MatchEventNotFoundError extends Error {
  constructor(public readonly eventId: string) {
    super(`Match event '${eventId}' not found.`)
    this.name = 'MatchEventNotFoundError'
  }
}

export class EventTeamNotInMatchError extends Error {
  constructor(public readonly teamId: string) {
    super(`Team '${teamId}' does not play this match.`)
    this.name = 'EventTeamNotInMatchError'
  }
}

export class EventPlayerNotInTeamError extends Error {
  constructor(public readonly teamPlayerId: string) {
    super(`Player '${teamPlayerId}' is not in that team's roster.`)
    this.name = 'EventPlayerNotInTeamError'
  }
}

export class DuplicateCardError extends Error {
  constructor(public readonly cardType: 'yellow_card' | 'red_card') {
    super(`That player already has a ${cardType} in this match.`)
    this.name = 'DuplicateCardError'
  }
}

/** El acta tiene más goles cargados que los del marcador. */
export class GoalsExceedScoreError extends Error {
  constructor(
    public readonly teamName: string,
    public readonly score: number,
  ) {
    super(`More goals recorded for '${teamName}' than the ${score} on the scoreboard.`)
    this.name = 'GoalsExceedScoreError'
  }
}

export class TeamHasFixtureError extends Error {
  constructor(public readonly matchCount: number) {
    super(`That team already has ${matchCount} match(es) in the fixture.`)
    this.name = 'TeamHasFixtureError'
  }
}

export class TeamHasEventsError extends Error {
  constructor(public readonly count: number) {
    super(`That team has ${count} recorded event(s).`)
    this.name = 'TeamHasEventsError'
  }
}

export class TeamPlayerHasEventsError extends Error {
  constructor(public readonly count: number) {
    super(`That player has ${count} recorded event(s).`)
    this.name = 'TeamPlayerHasEventsError'
  }
}

export class TournamentHasFixtureError extends Error {
  constructor(public readonly matchCount: number) {
    super(`The tournament has a fixture of ${matchCount} match(es).`)
    this.name = 'TournamentHasFixtureError'
  }
}

export class NotAGroupsTournamentError extends Error {
  constructor() {
    super('Seeding playoffs only applies to group+playoff tournaments.')
    this.name = 'NotAGroupsTournamentError'
  }
}

export class PlayoffStageNotFoundError extends Error {
  constructor() {
    super('This tournament has no playoff stage.')
    this.name = 'PlayoffStageNotFoundError'
  }
}

export class GroupStageNotFinishedError extends Error {
  constructor(public readonly pending: number) {
    super(`${pending} group-stage match(es) still pending.`)
    this.name = 'GroupStageNotFinishedError'
  }
}

export class PlayoffsAlreadyStartedError extends Error {
  constructor() {
    super('The playoffs already started: they cannot be re-seeded.')
    this.name = 'PlayoffsAlreadyStartedError'
  }
}

/** El cuadro se generó antes de que existieran los source_seed (migr. 065). */
export class PlayoffBracketNotSeedableError extends Error {
  constructor() {
    super('This bracket was generated before seeding support existed.')
    this.name = 'PlayoffBracketNotSeedableError'
  }
}

export class PlayoffSeedMismatchError extends Error {
  constructor(
    public readonly expected: number,
    public readonly seeded: number,
  ) {
    super(`Expected to seed ${expected} slots but seeded ${seeded}.`)
    this.name = 'PlayoffSeedMismatchError'
  }
}

// ─── Inscripciones (migr. 066) ──────────────────────────────────────

/** El equipo no tiene arancel cargado: no hay nada que cobrar. */
export class TeamHasNoFeeError extends Error {
  constructor(public readonly teamName: string) {
    super(`Team '${teamName}' has no inscription fee to charge.`)
    this.name = 'TeamHasNoFeeError'
  }
}

/** El cobro supera lo que el equipo todavía debe. */
export class InscriptionOverpaidError extends Error {
  constructor(
    public readonly teamName: string,
    public readonly pending: number,
  ) {
    super(`Charge exceeds the ${pending} pending for team '${teamName}'.`)
    this.name = 'InscriptionOverpaidError'
  }
}

/** Un equipo con plata cobrada no se borra: se marca 'withdrawn'. */
export class TeamHasPaymentsError extends Error {
  constructor(public readonly count: number) {
    super(`That team has ${count} registered payment(s).`)
    this.name = 'TeamHasPaymentsError'
  }
}

/** Empate irresoluble justo en el puesto de corte de una zona. */
export class StandingsTieUnresolvedError extends Error {
  constructor(
    public readonly groupLabel: string,
    public readonly teamNames: string[],
  ) {
    super(
      `Group '${groupLabel}': ${teamNames.join(', ')} are tied at the qualification cut and no criterion separates them.`,
    )
    this.name = 'StandingsTieUnresolvedError'
  }
}
