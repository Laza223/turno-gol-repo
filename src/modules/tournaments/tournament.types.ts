// Tipos puros del módulo Torneos. Sin imports server-only: los consumen las
// fixtures de test y las stories de Storybook.

export type TournamentFormat = 'league' | 'knockout' | 'groups_playoff'

export type TournamentStatus =
  | 'draft'
  | 'registration'
  | 'in_progress'
  | 'finished'
  | 'canceled'

export type TournamentTeamStatus =
  | 'registered'
  | 'confirmed'
  | 'withdrawn'
  | 'disqualified'

/**
 * Criterios de desempate, aplicados EN ORDEN después de los puntos.
 * Viven como text[] en la DB (no como enum) para poder crecer sin migración;
 * el set válido lo valida Zod.
 */
export const TIEBREAKERS = [
  'goal_diff',
  'goals_for',
  'goals_against',
  'head_to_head',
  'wins',
  'fair_play',
  'drawn_lots',
] as const

export type Tiebreaker = (typeof TIEBREAKERS)[number]

export type TournamentRow = {
  id: string
  tenantId: string
  name: string
  slug: string
  format: TournamentFormat
  status: TournamentStatus
  /** YYYY-MM-DD (día operativo). */
  startsOn: string
  endsOn: string | null
  registrationDeadline: string | null
  maxTeams: number | null
  matchDurationMinutes: number
  restBetweenMatchesMinutes: number
  /** Centavos ARS. */
  inscriptionFee: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  tiebreakers: Tiebreaker[]
  yellowCardsForSuspension: number
  redCardSuspensionMatches: number
  walkoverGoalsFor: number
  isPublic: boolean
  notes: string | null
  createdByStaff: string | null
  createdAt: Date
  updatedAt: Date
}

export type TournamentTeamRow = {
  id: string
  tenantId: string
  tournamentId: string
  name: string
  contactPlayerId: string | null
  contactName: string | null
  contactPhone: string | null
  status: TournamentTeamStatus
  groupLabel: string | null
  seed: number | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export type TournamentTeamPlayerRow = {
  id: string
  tenantId: string
  teamId: string
  fullName: string
  playerId: string | null
  dni: string | null
  shirtNumber: number | null
  createdAt: Date
  updatedAt: Date
}

export type CreateTournamentInput = {
  name: string
  format: TournamentFormat
  startsOn: string
  endsOn?: string | null
  registrationDeadline?: string | null
  maxTeams?: number | null
  matchDurationMinutes?: number
  restBetweenMatchesMinutes?: number
  inscriptionFee?: number
  pointsWin?: number
  pointsDraw?: number
  pointsLoss?: number
  tiebreakers?: Tiebreaker[]
  yellowCardsForSuspension?: number
  redCardSuspensionMatches?: number
  walkoverGoalsFor?: number
  notes?: string | null
}

export type UpdateTournamentInput = Partial<CreateTournamentInput> & {
  status?: TournamentStatus
  isPublic?: boolean
}

export type CreateTeamInput = {
  name: string
  contactPlayerId?: string | null
  contactName?: string | null
  contactPhone?: string | null
  notes?: string | null
}

export type UpdateTeamInput = Partial<CreateTeamInput> & {
  status?: TournamentTeamStatus
  groupLabel?: string | null
  seed?: number | null
}

export type CreateTeamPlayerInput = {
  fullName: string
  playerId?: string | null
  dni?: string | null
  shirtNumber?: number | null
}

/**
 * Una franja de canchas × fechas que el torneo quiere ocupar. Se expande a una
 * reserva POR HORA y POR CANCHA (ver reserveTournamentSlots).
 */
export type ReserveSlotsInput = {
  courtIds: string[]
  /** YYYY-MM-DD, días operativos. */
  dates: string[]
  /** HH:MM */
  timeStart: string
  /** HH:MM o '24:00' */
  timeEnd: string
}

/** Una hora concreta que no se pudo tomar porque ya estaba ocupada. */
export type SlotConflict = {
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
}

export type ReserveSlotsResult = {
  reserved: number
  conflicts: SlotConflict[]
}

/** Una hora que el torneo posee, tal como se ve en la grilla. */
export type TournamentSlotRow = {
  bookingId: string
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  startsAt: Date
  endsAt: Date
}
