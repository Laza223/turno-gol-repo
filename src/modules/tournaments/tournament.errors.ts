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
    super(
      `Tournament still owns ${bookingCount} booked hour(s). Release them first.`,
    )
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
