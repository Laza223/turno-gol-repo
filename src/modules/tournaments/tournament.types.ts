// Tipos puros del módulo Torneos. Sin imports server-only: los consumen las
// fixtures de test y las stories de Storybook.

export type TournamentFormat = 'league' | 'knockout' | 'groups_playoff'

export type TournamentStatus = 'draft' | 'registration' | 'in_progress' | 'finished' | 'canceled'

export type TournamentTeamStatus = 'registered' | 'confirmed' | 'withdrawn' | 'disqualified'

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
  /** Migr. 066. Centavos ARS. Snapshot del arancel al inscribirse. */
  inscriptionFee: number
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
  /** Centavos ARS. Sin valor, hereda el del torneo (migr. 066). */
  inscriptionFee?: number
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

// ─── Fixture (migr. 064) ────────────────────────────────────────────

export type TournamentStageKind = 'league' | 'group_stage' | 'knockout'

export type TournamentMatchStatus = 'scheduled' | 'played' | 'walkover' | 'postponed' | 'canceled'

export type TournamentStageRow = {
  id: string
  tenantId: string
  tournamentId: string
  name: string
  kind: TournamentStageKind
  orderIndex: number
  legs: number
  groupsCount: number | null
  teamsAdvancePerGroup: number | null
  createdAt: Date
  updatedAt: Date
}

export type TournamentMatchRow = {
  id: string
  tenantId: string
  tournamentId: string
  stageId: string
  round: number
  groupLabel: string | null
  bracketSlot: number | null
  homeTeamId: string | null
  awayTeamId: string | null
  homeSourceMatchId: string | null
  awaySourceMatchId: string | null
  isThirdPlace: boolean
  courtId: string | null
  bookingId: string | null
  startsAt: Date | null
  endsAt: Date | null
  status: TournamentMatchStatus
  homeScore: number | null
  awayScore: number | null
  /** Migr. 065. Solo definen la llave: no suman a goles a favor/en contra. */
  homePenalties: number | null
  awayPenalties: number | null
  /** Migr. 065. null con status='walkover' = no se presentó ninguno. */
  walkoverWinnerTeamId: string | null
  /** Migr. 065. De qué puesto de zona sale cada lado del cuadro (1-based). */
  homeSourceSeed: number | null
  awaySourceSeed: number | null
  playedAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

/** Partido con los nombres ya resueltos, para la UI. */
export type TournamentMatchView = TournamentMatchRow & {
  homeTeamName: string | null
  awayTeamName: string | null
  courtName: string | null
}

export type GenerateFixtureInput = {
  /** 1 = solo ida, 2 = ida y vuelta. Ignorado en knockout. */
  legs?: 1 | 2
  /** Solo para groups_playoff. */
  groupsCount?: number
  teamsAdvancePerGroup?: number
  /** Solo para knockout: agrega el partido por el 3er puesto. */
  thirdPlace?: boolean
  /** Si es false, el fixture se genera sin día ni hora (se agenda a mano). */
  autoSchedule?: boolean
}

export type GenerateFixtureResult = {
  stages: number
  matches: number
  /** Partidos que no entraron en las horas que el torneo posee. */
  unscheduled: number
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

// ─── Resultados y acta (migr. 065) ──────────────────────────────────

export type TournamentEventType = 'goal' | 'own_goal' | 'yellow_card' | 'red_card'

export type TournamentMatchEventRow = {
  id: string
  tenantId: string
  tournamentId: string
  matchId: string
  /** Equipo del AUTOR. En own_goal el gol suma al rival. */
  teamId: string
  teamPlayerId: string | null
  type: TournamentEventType
  minute: number | null
  /** Override del tribunal para esta roja. 0 = indulto. */
  suspensionMatches: number | null
  notes: string | null
  createdByStaff: string | null
  createdAt: Date
}

/** Evento con los nombres ya resueltos, para el acta. */
export type TournamentMatchEventView = TournamentMatchEventRow & {
  teamName: string | null
  playerName: string | null
  shirtNumber: number | null
}

export type SaveMatchResultInput = {
  matchId: string
  homeScore: number
  awayScore: number
  /** Solo si la fase es de llaves y el partido terminó empatado. */
  homePenalties?: number | null
  awayPenalties?: number | null
  notes?: string | null
}

export type MarkWalkoverInput = {
  matchId: string
  /** null = no se presentó ninguno de los dos: pierden ambos. */
  winnerTeamId: string | null
  notes?: string | null
}

export type AddMatchEventInput = {
  matchId: string
  teamId: string
  teamPlayerId?: string | null
  type: TournamentEventType
  minute?: number | null
  /** Solo en red_card: override de las fechas de suspensión. */
  suspensionMatches?: number | null
  notes?: string | null
}

/** Fila de la tabla de goleadores. */
export type ScorerRow = {
  teamPlayerId: string
  playerName: string
  shirtNumber: number | null
  teamId: string
  teamName: string
  goals: number
}

export type TopScorersResult = {
  rows: ScorerRow[]
  /** Goles de los marcadores que todavía no tienen autor cargado. */
  unattributedGoals: number
}

// ─── Inscripciones (migr. 066) ──────────────────────────────────────

/** Un cobro de inscripción, que por dentro es una fila de cash_flows. */
export type InscriptionPaymentRow = {
  id: string
  teamId: string
  /** Centavos ARS. */
  amount: number
  method: 'cash' | 'transfer' | 'mercadopago' | 'other'
  description: string
  occurredAt: Date
}

/** Estado de cobro de un equipo: arancel, pagado y saldo. */
export type TeamInscriptionStatus = {
  teamId: string
  teamName: string
  teamStatus: TournamentTeamStatus
  /** Snapshot del arancel de ESTE equipo, no el del torneo. */
  fee: number
  paid: number
  /** fee − paid, nunca negativo. */
  pending: number
  payments: number
  lastPaidAt: Date | null
}

export type RegisterInscriptionPaymentInput = {
  teamId: string
  /** Método mixto (D2, Fase 1): 1-5 líneas de {monto en centavos ARS, método}. */
  charges: { amount: number; method: 'cash' | 'transfer' | 'mercadopago' | 'other' }[]
  note?: string | null
  clientIdempotencyKey?: string
}
