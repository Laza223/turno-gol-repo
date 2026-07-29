import { z } from 'zod'
import {
  boundedText,
  dateStr,
  hhmm,
  hhmmEnd,
  moneyCents,
  uuid,
} from '@/shared/validation/primitives'
import { TIEBREAKERS } from './tournament.types'

// Mensajes en es-AR. `uuid` sale de primitives: NO usar z.uuid() (Zod 4 valida
// RFC 9562 y rechaza cosas que el repo acepta).

const tournamentName = z
  .string()
  .trim()
  .min(1, 'El nombre del torneo no puede estar vacío.')
  .max(120, 'El nombre no puede superar los 120 caracteres.')

const teamName = z
  .string()
  .trim()
  .min(1, 'El nombre del equipo no puede estar vacío.')
  .max(80, 'El nombre no puede superar los 80 caracteres.')

const tiebreakerSchema = z.enum(TIEBREAKERS)

export const createTournamentSchema = z
  .object({
    name: tournamentName,
    format: z.enum(['league', 'knockout', 'groups_playoff'], {
      message: 'Formato de torneo inválido.',
    }),
    startsOn: dateStr,
    endsOn: dateStr.nullish(),
    registrationDeadline: dateStr.nullish(),
    maxTeams: z
      .number()
      .int()
      .min(2, 'Un torneo necesita al menos 2 equipos.')
      .max(256, 'El máximo es 256 equipos.')
      .nullish(),
    // Duración del PARTIDO, no del turno de la grilla (que es fijo de 60 min).
    matchDurationMinutes: z
      .number()
      .int()
      .min(10, 'Un partido no puede durar menos de 10 minutos.')
      .max(120, 'Un partido no puede durar más de 120 minutos.')
      .default(60),
    restBetweenMatchesMinutes: z
      .number()
      .int()
      .min(0)
      .max(240, 'El descanso no puede superar las 4 horas.')
      .default(0),
    inscriptionFee: moneyCents.default(0),
    pointsWin: z.number().int().min(0).max(10).default(3),
    pointsDraw: z.number().int().min(0).max(10).default(1),
    pointsLoss: z.number().int().min(0).max(10).default(0),
    tiebreakers: z
      .array(tiebreakerSchema)
      .min(1, 'Hace falta al menos un criterio de desempate.')
      .max(TIEBREAKERS.length)
      .default(['goal_diff', 'goals_for', 'head_to_head', 'fair_play', 'drawn_lots']),
    yellowCardsForSuspension: z.number().int().min(1).max(20).default(3),
    redCardSuspensionMatches: z.number().int().min(0).max(20).default(1),
    walkoverGoalsFor: z.number().int().min(0).max(20).default(3),
    notes: boundedText(1000).nullish(),
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: 'La fecha de fin no puede ser anterior a la de inicio.',
    path: ['endsOn'],
  })
  .refine((v) => !v.registrationDeadline || v.registrationDeadline <= v.startsOn, {
    message: 'El cierre de inscripción no puede ser posterior al inicio.',
    path: ['registrationDeadline'],
  })
  // Espeja chk_tournament_points: sin esto el INSERT explota con un 23514 crudo.
  .refine((v) => v.pointsWin >= v.pointsDraw && v.pointsDraw >= v.pointsLoss, {
    message: 'Los puntos por ganar no pueden ser menos que por empatar o perder.',
    path: ['pointsWin'],
  })
  // Criterios repetidos son siempre un error de carga y romperían el orden.
  .refine((v) => new Set(v.tiebreakers).size === v.tiebreakers.length, {
    message: 'No se puede repetir un criterio de desempate.',
    path: ['tiebreakers'],
  })

export const updateTournamentSchema = z.object({
  id: uuid,
  name: tournamentName.optional(),
  endsOn: dateStr.nullish(),
  registrationDeadline: dateStr.nullish(),
  maxTeams: z.number().int().min(2).max(256).nullish(),
  matchDurationMinutes: z.number().int().min(10).max(120).optional(),
  restBetweenMatchesMinutes: z.number().int().min(0).max(240).optional(),
  inscriptionFee: moneyCents.optional(),
  pointsWin: z.number().int().min(0).max(10).optional(),
  pointsDraw: z.number().int().min(0).max(10).optional(),
  pointsLoss: z.number().int().min(0).max(10).optional(),
  tiebreakers: z.array(tiebreakerSchema).min(1).max(TIEBREAKERS.length).optional(),
  yellowCardsForSuspension: z.number().int().min(1).max(20).optional(),
  redCardSuspensionMatches: z.number().int().min(0).max(20).optional(),
  walkoverGoalsFor: z.number().int().min(0).max(20).optional(),
  status: z.enum(['draft', 'registration', 'in_progress', 'finished', 'canceled']).optional(),
  isPublic: z.boolean().optional(),
  notes: boundedText(1000).nullish(),
})

export const tournamentIdSchema = z.object({ id: uuid })

export const createTeamSchema = z.object({
  tournamentId: uuid,
  name: teamName,
  contactPlayerId: uuid.nullish(),
  contactName: boundedText(120).nullish(),
  contactPhone: boundedText(30).nullish(),
  // Sin valor, addTeam le pone el arancel vigente del torneo (migr. 066).
  inscriptionFee: moneyCents.optional(),
  notes: boundedText(500).nullish(),
})

export const updateTeamSchema = z.object({
  id: uuid,
  name: teamName.optional(),
  contactPlayerId: uuid.nullish(),
  contactName: boundedText(120).nullish(),
  contactPhone: boundedText(30).nullish(),
  status: z.enum(['registered', 'confirmed', 'withdrawn', 'disqualified']).optional(),
  groupLabel: z.string().trim().min(1).max(10).nullish(),
  seed: z.number().int().positive().nullish(),
  inscriptionFee: moneyCents.optional(),
  notes: boundedText(500).nullish(),
})

export const teamIdSchema = z.object({ id: uuid })

export const createTeamPlayerSchema = z.object({
  teamId: uuid,
  fullName: z
    .string()
    .trim()
    .min(1, 'El nombre del jugador no puede estar vacío.')
    .max(120, 'El nombre no puede superar los 120 caracteres.'),
  playerId: uuid.nullish(),
  dni: z
    .string()
    .trim()
    .regex(/^\d{7,9}$/, 'El DNI tiene que tener entre 7 y 9 dígitos.')
    .nullish(),
  shirtNumber: z.number().int().min(0).max(999).nullish(),
})

export const teamPlayerIdSchema = z.object({ id: uuid })

export const reserveSlotsSchema = z.object({
  tournamentId: uuid,
  courtIds: z
    .array(uuid)
    .min(1, 'Elegí al menos una cancha.')
    .max(20, 'No se pueden tomar más de 20 canchas de una.'),
  dates: z
    .array(dateStr)
    .min(1, 'Elegí al menos una fecha.')
    // 90 fechas × 20 canchas × 24 horas es el techo razonable de una operación.
    .max(90, 'No se pueden tomar más de 90 fechas de una.'),
  timeStart: hhmm,
  timeEnd: hhmmEnd,
})

export const releaseSlotsSchema = z.object({
  tournamentId: uuid,
  /** Libera desde esta fecha en adelante; lo anterior queda como histórico. */
  fromDate: dateStr,
})

// ─── Fixture (migr. 064) ────────────────────────────────────────────

export const generateFixtureSchema = z
  .object({
    tournamentId: uuid,
    legs: z.union([z.literal(1), z.literal(2)]).default(1),
    groupsCount: z
      .number()
      .int()
      .min(1, 'Hace falta al menos una zona.')
      .max(16, 'El máximo es 16 zonas.')
      .optional(),
    teamsAdvancePerGroup: z
      .number()
      .int()
      .min(1, 'Tiene que clasificar al menos 1 equipo por zona.')
      .max(16)
      .optional(),
    thirdPlace: z.boolean().default(false),
    /** false = generar sin día ni hora, para agendar a mano. */
    autoSchedule: z.boolean().default(true),
  })
  // Si clasifican más equipos de los que hay por zona, el cuadro sale mal.
  .refine(
    (v) =>
      v.groupsCount === undefined ||
      v.teamsAdvancePerGroup === undefined ||
      v.groupsCount * v.teamsAdvancePerGroup >= 2,
    {
      message: 'Tienen que clasificar al menos 2 equipos en total.',
      path: ['teamsAdvancePerGroup'],
    }
  )

export const clearFixtureSchema = z.object({ tournamentId: uuid })

export const rescheduleMatchSchema = z.object({
  matchId: uuid,
  courtId: uuid,
  /** Instante del partido en ISO. Lo arma la UI a partir de fecha + hora. */
  startsAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha y hora inválidas.'),
})

// ─── Resultados y acta (migr. 065) ──────────────────────────────────

const score = z
  .number()
  .int()
  .min(0, 'El marcador no puede ser negativo.')
  .max(99, 'El marcador no puede pasar de 99.')

const penalties = z
  .number()
  .int()
  .min(0, 'Los penales no pueden ser negativos.')
  .max(99, 'Demasiados penales.')

export const saveMatchResultSchema = z
  .object({
    matchId: uuid,
    homeScore: score,
    awayScore: score,
    homePenalties: penalties.nullable().optional(),
    awayPenalties: penalties.nullable().optional(),
    notes: boundedText(500).nullable().optional(),
  })
  // Los penales van de a dos o no van.
  .refine((v) => (v.homePenalties ?? null) === null || (v.awayPenalties ?? null) !== null, {
    message: 'Cargá los penales de los dos equipos.',
    path: ['awayPenalties'],
  })
  .refine((v) => (v.awayPenalties ?? null) === null || (v.homePenalties ?? null) !== null, {
    message: 'Cargá los penales de los dos equipos.',
    path: ['homePenalties'],
  })
  // Una tanda de penales no termina empatada: alguien pasa.
  .refine((v) => (v.homePenalties ?? null) === null || v.homePenalties !== v.awayPenalties, {
    message: 'La tanda de penales no puede terminar empatada.',
    path: ['awayPenalties'],
  })
  // El CHECK de la base dice lo mismo; acá el mensaje es en es-AR.
  .refine((v) => (v.homePenalties ?? null) === null || v.homeScore === v.awayScore, {
    message: 'Los penales solo se cargan si el partido terminó empatado.',
    path: ['homePenalties'],
  })

export const markWalkoverSchema = z.object({
  matchId: uuid,
  /** null = no se presentó ninguno de los dos. */
  winnerTeamId: uuid.nullable(),
  notes: boundedText(500).nullable().optional(),
})

export const clearMatchResultSchema = z.object({ matchId: uuid })

export const addMatchEventSchema = z
  .object({
    matchId: uuid,
    teamId: uuid,
    teamPlayerId: uuid.nullable().optional(),
    type: z.enum(['goal', 'own_goal', 'yellow_card', 'red_card']),
    minute: z
      .number()
      .int()
      .min(0, 'El minuto no puede ser negativo.')
      .max(200, 'Minuto fuera de rango.')
      .nullable()
      .optional(),
    suspensionMatches: z
      .number()
      .int()
      .min(0)
      .max(20, 'Máximo 20 fechas de suspensión.')
      .nullable()
      .optional(),
    notes: boundedText(300).nullable().optional(),
  })
  // Una tarjeta necesita sujeto: sin jugador no hay a quién suspender.
  .refine(
    (v) => (v.type !== 'yellow_card' && v.type !== 'red_card') || (v.teamPlayerId ?? null) !== null,
    { message: 'Elegí al jugador que vio la tarjeta.', path: ['teamPlayerId'] }
  )
  // El override de fechas solo aplica a una roja.
  .refine((v) => (v.suspensionMatches ?? null) === null || v.type === 'red_card', {
    message: 'Las fechas de suspensión solo se cargan en una roja.',
    path: ['suspensionMatches'],
  })

export const deleteMatchEventSchema = z.object({ eventId: uuid })

export const seedPlayoffsSchema = z.object({ tournamentId: uuid })

// ─── Inscripciones (migr. 066) ──────────────────────────────────────

// ─── Autocomplete de capitán (Equipos) ──────────────────────────────

export const searchPlayersForCaptainSchema = z.object({
  query: z.string().trim().max(120),
})

export const registerInscriptionPaymentSchema = z.object({
  teamId: uuid,
  // moneyCents acepta 0; un cobro de $0 no es un cobro.
  amount: moneyCents.refine((v) => v > 0, 'El monto tiene que ser mayor a cero.'),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other'], {
    message: 'Método de pago inválido.',
  }),
  note: boundedText(300).nullable().optional(),
  // Cruce #10: sin la clave en el schema, z.object() la strippea y el
  // ON CONFLICT del service nunca corre → doble-tap = cobro duplicado.
  clientIdempotencyKey: uuid.optional(),
})
