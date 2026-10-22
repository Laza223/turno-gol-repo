import type {
  RIVAL_LEVELS,
  RIVAL_POSITIONS,
  RIVAL_SEEKING,
  RIVAL_SEEKING_POSITIONS,
} from './rival.schema'

export type RivalLevel = (typeof RIVAL_LEVELS)[number]
export type RivalPosition = (typeof RIVAL_POSITIONS)[number]
export type RivalSeeking = (typeof RIVAL_SEEKING)[number]
export type RivalSeekingPosition = (typeof RIVAL_SEEKING_POSITIONS)[number]
export type RivalMatchStatus = 'open' | 'canceled'
export type RivalParticipantRole = 'player' | 'rival_captain'
export type RivalParticipantStatus =
  'requested' | 'confirmed' | 'bench' | 'declined' | 'left' | 'removed'
export type RivalParticipantOrigin = 'invite' | 'board'

/** Datos del partido y contador, sin personas (`rival_public_match`). */
export type RivalPublicMatch = {
  id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  tenantCity: string
  startsAt: Date
  format: number
  capacity: number
  level: RivalLevel
  status: RivalMatchStatus
  seeking: RivalSeeking | null
  seekingPosition: RivalSeekingPosition | null
  confirmedCount: number
  filledAt: Date | null
  courtDeclared: boolean
  /** Sello "Reservada en TurnoGol": derivado en cada lectura, no se guarda. */
  hasStamp: boolean
  isOrganizer: boolean
}

/** Tarjeta del tablón. Nunca lleva el código de invitación ni al organizador. */
export type RivalBoardItem = {
  id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  startsAt: Date
  format: number
  capacity: number
  level: RivalLevel
  seeking: RivalSeeking
  seekingPosition: RivalSeekingPosition | null
  confirmedCount: number
  hasStamp: boolean
}

export type RivalBoardCursor = { startsAt: Date; id: string }

export type RivalBoardPage = {
  items: RivalBoardItem[]
  /** `null` = no hay más páginas. */
  nextCursor: RivalBoardCursor | null
}

/**
 * Una fila del plantel. Posición, zona, partidos jugados y antigüedad solo
 * vienen para el organizador (spec §6); para el resto son `null`.
 */
export type RivalRosterEntry = {
  participantId: string
  playerId: string
  role: RivalParticipantRole
  status: RivalParticipantStatus
  origin: RivalParticipantOrigin
  isMe: boolean
  shortName: string
  avatarUrl: string | null
  confirmedAt: Date | null
  position: RivalPosition | null
  zone: string | null
  gamesPlayed: number | null
  memberSince: Date | null
}

/** Un partido de "Mis partidos" con mi estado en él. */
export type RivalMyMatch = Omit<RivalPublicMatch, 'tenantCity'> & {
  onBoard: boolean
  /** Solo para el organizador. */
  inviteCode: string | null
  isHidden: boolean
  participantId: string | null
  myRole: RivalParticipantRole | null
  myStatus: RivalParticipantStatus | null
  myOrigin: RivalParticipantOrigin | null
}

export type RivalJoinResult = {
  participantId: string
  matchId: string
  status: RivalParticipantStatus
  /** `false` = ya estaba en el partido (la llamada es idempotente). */
  joined: boolean
}
