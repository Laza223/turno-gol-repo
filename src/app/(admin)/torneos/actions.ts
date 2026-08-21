'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminStaffAction, requireOperatorStaff } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import {
  createTournament,
  deleteTournament,
  updateTournament,
} from '@/modules/tournaments/tournament.service'
import {
  addTeam,
  addTeamPlayer,
  getTeam,
  removeTeam,
  removeTeamPlayer,
  updateTeam,
} from '@/modules/tournaments/tournament-team.service'
import { registerInscriptionPayment } from '@/modules/tournaments/tournament-payment.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { formatArs } from '@/lib/format'
import {
  searchTenantPlayers,
  type PlayerSearchResult,
} from '@/modules/players/player-search.service'
import {
  releaseTournamentSlots,
  reserveTournamentSlots,
} from '@/modules/tournaments/tournament-slots.service'
import { BookingDateOutOfRangeError } from '@/modules/bookings/booking.errors'
import { paidPeriodErrorMessage } from '@/modules/bookings/paid-period.guard'
import {
  createTeamPlayerSchema,
  createTeamSchema,
  createTournamentSchema,
  releaseSlotsSchema,
  reserveSlotsSchema,
  teamIdSchema,
  teamPlayerIdSchema,
  tournamentIdSchema,
  updateTeamSchema,
  updateTournamentSchema,
} from '@/modules/tournaments/tournament.schema'
import {
  clearFixture,
  generateFixture,
  rescheduleMatch,
} from '@/modules/tournaments/tournament-fixture.service'
import {
  addMatchEventSchema,
  clearFixtureSchema,
  clearMatchResultSchema,
  deleteMatchEventSchema,
  generateFixtureSchema,
  markWalkoverSchema,
  registerInscriptionPaymentSchema,
  rescheduleMatchSchema,
  saveMatchResultSchema,
  searchPlayersForCaptainSchema,
  seedPlayoffsSchema,
} from '@/modules/tournaments/tournament.schema'
import {
  addMatchEvent,
  clearMatchResult,
  deleteMatchEvent,
  markWalkover,
  saveMatchResult,
} from '@/modules/tournaments/tournament-result.service'
import { seedPlayoffs } from '@/modules/tournaments/tournament-standings.service'
import {
  CourtSlotTakenError,
  DownstreamMatchAlreadyPlayedError,
  DuplicateCardError,
  DuplicateShirtNumberError,
  EventPlayerNotInTeamError,
  EventTeamNotInMatchError,
  GoalsExceedScoreError,
  GroupStageNotFinishedError,
  InscriptionOverpaidError,
  KnockoutTieUnresolvedError,
  MatchEventNotFoundError,
  MatchNotPlayableError,
  MatchTeamsUndefinedError,
  NotAGroupsTournamentError,
  PenaltiesNotAllowedError,
  PlayoffBracketNotSeedableError,
  PlayoffSeedMismatchError,
  PlayoffStageNotFoundError,
  PlayoffsAlreadyStartedError,
  StandingsTieUnresolvedError,
  TeamHasEventsError,
  TeamHasFixtureError,
  TeamHasNoFeeError,
  TeamHasPaymentsError,
  TeamPlayerHasEventsError,
  TournamentHasFixtureError,
  WalkoverNeedsWinnerError,
  WalkoverWinnerNotInMatchError,
  WalkoverWithEventsError,
  DuplicateTeamNameError,
  FixtureAlreadyExistsError,
  FixtureGenerationError,
  MatchNotFoundError,
  MatchOutsideOwnedTimeError,
  NoSlotsReservedError,
  TeamDoubleBookedError,
  TournamentCourtUnavailableError,
  TournamentFullError,
  TournamentHasBookingsError,
  TournamentNotDeletableError,
  TournamentNotFoundError,
  TournamentSlotRangeError,
  TournamentTeamNotFoundError,
} from '@/modules/tournaments/tournament.errors'
import type { SlotConflict } from '@/modules/tournaments/tournament.types'

export type TournamentActionResult =
  { success: true; id?: string } | { success: false; error: string }

export type ReserveSlotsActionResult =
  { success: true; reserved: number; conflicts: SlotConflict[] } | { success: false; error: string }

export type GenerateFixtureActionResult =
  { success: true; matches: number; unscheduled: number } | { success: false; error: string }

export type SearchPlayersActionResult =
  { success: true; players: PlayerSearchResult[] } | { success: false; error: string }

function revalidateTorneos(id?: string): void {
  revalidatePath('/torneos')
  if (id) {
    revalidatePath(`/torneos/${id}`)
    revalidatePath(`/torneos/${id}/fixture`)
    revalidatePath(`/torneos/${id}/posiciones`)
    revalidatePath(`/torneos/${id}/inscripciones`)
  }
  // Las horas del torneo son reservas: la grilla las muestra.
  revalidatePath('/grilla')
}

/**
 * Traducción a es-AR de los errores de dominio. Se llama SIEMPRE fuera de
 * `withTenantContext`: atrapar adentro del callback transaccional hace que
 * drizzle commitee lo escrito antes del throw (regla documentada en
 * caja/productos/actions.ts).
 */
function mapTournamentError(err: unknown): string | null {
  if (err instanceof TournamentNotFoundError) return 'Ese torneo ya no existe.'
  if (err instanceof TournamentTeamNotFoundError) return 'Ese equipo ya no existe.'
  if (err instanceof TournamentNotDeletableError) {
    return 'Un torneo que ya arrancó no se borra: cancelalo desde Configuración.'
  }
  if (err instanceof TournamentHasBookingsError) {
    return `El torneo todavía tiene ${err.bookingCount} hora(s) tomadas en la grilla. Liberalas primero.`
  }
  if (err instanceof TournamentFullError) {
    return `El torneo ya llegó al cupo de ${err.maxTeams} equipos.`
  }
  if (err instanceof DuplicateTeamNameError) {
    return `Ya hay un equipo llamado "${err.teamName}" en este torneo.`
  }
  if (err instanceof DuplicateShirtNumberError) {
    return `El número ${err.shirtNumber} ya está usado en este equipo.`
  }
  if (err instanceof TournamentCourtUnavailableError) {
    return 'Alguna de las canchas elegidas no está disponible.'
  }
  if (err instanceof TournamentSlotRangeError) return err.message
  if (err instanceof NoSlotsReservedError) {
    return 'Ninguna de esas horas estaba libre: no se tomó nada.'
  }
  if (err instanceof BookingDateOutOfRangeError && err.reason === 'after_period_end') {
    return paidPeriodErrorMessage(err.cutoff)
  }
  // El motor de fixture arma su mensaje ya en es-AR con el detalle del caso.
  if (err instanceof FixtureGenerationError) return err.message
  if (err instanceof FixtureAlreadyExistsError) {
    return `Este torneo ya tiene un fixture de ${err.matchCount} partidos. Borralo antes de generar uno nuevo.`
  }
  if (err instanceof MatchNotFoundError) return 'Ese partido ya no existe.'
  if (err instanceof MatchOutsideOwnedTimeError) {
    return 'El partido no entra en ninguna hora que el torneo tenga tomada en esa cancha.'
  }
  if (err instanceof TeamDoubleBookedError) {
    return `${err.teamName} ya tiene otro partido a esa hora.`
  }
  if (err instanceof CourtSlotTakenError) {
    return 'Esa cancha ya tiene otro partido a esa hora.'
  }
  // ── Resultados y disciplina (migr. 065) ──
  if (err instanceof MatchTeamsUndefinedError) {
    return 'Todavía no se sabe qué equipos juegan este partido: primero se tiene que definir la llave.'
  }
  if (err instanceof MatchNotPlayableError) {
    return 'Ese partido está cancelado: no se le puede cargar resultado.'
  }
  if (err instanceof KnockoutTieUnresolvedError) {
    return 'Una llave no puede terminar empatada: cargá la definición por penales.'
  }
  if (err instanceof PenaltiesNotAllowedError) {
    return 'Los penales solo se cargan si el partido terminó empatado.'
  }
  if (err instanceof WalkoverWinnerNotInMatchError) {
    return 'El ganador del walkover tiene que ser uno de los dos equipos del partido.'
  }
  if (err instanceof WalkoverNeedsWinnerError) {
    return 'En una llave el walkover necesita un ganador: alguien tiene que pasar de ronda.'
  }
  if (err instanceof WalkoverWithEventsError) {
    return `Este partido tiene ${err.eventCount} gol(es) o tarjeta(s) cargados. Borralos del acta antes de marcarlo como no presentado.`
  }
  if (err instanceof DownstreamMatchAlreadyPlayedError) {
    return 'El partido siguiente del cuadro ya tiene resultado cargado. Borralo antes de corregir éste.'
  }
  if (err instanceof MatchEventNotFoundError) return 'Ese gol o tarjeta ya no está en el acta.'
  if (err instanceof EventTeamNotInMatchError) return 'Ese equipo no juega este partido.'
  if (err instanceof EventPlayerNotInTeamError) {
    return 'Ese jugador no está en el plantel del equipo.'
  }
  if (err instanceof DuplicateCardError) {
    return err.cardType === 'yellow_card'
      ? 'Ese jugador ya tiene una amarilla en este partido: la segunda amarilla se carga como roja.'
      : 'Ese jugador ya tiene una roja en este partido.'
  }
  if (err instanceof GoalsExceedScoreError) {
    return `Ya hay más goles cargados para ${err.teamName} que los ${err.score} del marcador. Borrá alguno o corregí el resultado.`
  }
  if (err instanceof TeamHasFixtureError) {
    return `Ese equipo ya tiene ${err.matchCount} partido(s) en el fixture. Borrá el fixture o marcalo como "se bajó".`
  }
  if (err instanceof TeamHasEventsError) {
    return `Ese equipo tiene ${err.count} gol(es) o tarjeta(s) cargados. Borralos del acta antes de sacarlo del torneo.`
  }
  // ── Inscripciones (migr. 066) ──
  if (err instanceof TeamHasPaymentsError) {
    return `Ese equipo ya tiene ${err.count} cobro(s) registrados en Caja. No se puede borrar: marcalo como "se bajó".`
  }
  if (err instanceof TeamHasNoFeeError) {
    return `${err.teamName} no tiene arancel cargado: no hay nada que cobrar.`
  }
  if (err instanceof InscriptionOverpaidError) {
    return err.pending === 0
      ? `${err.teamName} ya pagó la inscripción completa.`
      : `El cobro supera lo que ${err.teamName} debe (${formatArs(err.pending)}).`
  }
  if (err instanceof TeamPlayerHasEventsError) {
    return `Ese jugador tiene ${err.count} gol(es) o tarjeta(s) cargados. Borralos del acta antes de sacarlo del plantel.`
  }
  if (err instanceof TournamentHasFixtureError) {
    return `El torneo ya tiene un fixture de ${err.matchCount} partidos. Borralo antes de eliminar el torneo.`
  }
  if (err instanceof NotAGroupsTournamentError) {
    return 'Sembrar playoffs solo aplica a torneos con zonas.'
  }
  if (err instanceof PlayoffStageNotFoundError) return 'Este torneo no tiene fase de playoffs.'
  if (err instanceof GroupStageNotFinishedError) {
    return `Faltan ${err.pending} partido(s) de zona por cerrar.`
  }
  if (err instanceof PlayoffsAlreadyStartedError) {
    return 'Los playoffs ya arrancaron: no se pueden volver a sembrar. Borrá primero el resultado del cruce ya jugado.'
  }
  if (err instanceof PlayoffBracketNotSeedableError) {
    return 'Este cuadro se generó antes de la última actualización: borrá el fixture y volvé a generarlo.'
  }
  if (err instanceof PlayoffSeedMismatchError) {
    return 'El cuadro de playoffs no coincide con los clasificados. Regenerá el fixture.'
  }
  if (err instanceof StandingsTieUnresolvedError) {
    return `Zona ${err.groupLabel}: ${err.teamNames.join(' y ')} están empatados justo en el puesto de corte y ningún criterio los separa. Cargales el número de siembra para definir el sorteo.`
  }
  return null
}

/**
 * El módulo entero está detrás del flag. Se chequea en cada action y no solo en
 * la UI: esconder el item del menú no es un control de acceso.
 */
async function assertTournamentsEnabled(tenantId: string): Promise<string | null> {
  const enabled = await isFeatureEnabled(TOURNAMENTS_FLAG, tenantId)
  return enabled ? null : 'El módulo de Torneos no está habilitado en este complejo.'
}

// ── Torneo (configuración: solo admin) ──────────────────────────────

export async function createTournamentAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = createTournamentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let id: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      createTournament(tenant.id, user.staffUserId, parsed.data, tx),
    )
    id = row.id
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(id)
  return { success: true, id }
}

export async function updateTournamentAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = updateTournamentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      updateTournament(tenant.id, user.staffUserId, parsed.data, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(parsed.data.id)
  return { success: true, id: parsed.data.id }
}

/**
 * Borrar un torneo entero. UI: `[id]/BorrarTorneo.tsx`, al pie de la ficha.
 *
 * Solo se ofrece en `draft` y sin horas tomadas, que son las dos condiciones
 * que `deleteTournament` exige; un torneo que arrancó se cancela, no se borra.
 */
export async function deleteTournamentAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = tournamentIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      deleteTournament(tenant.id, user.staffUserId, parsed.data.id, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos()
  return { success: true }
}

// ── Equipos y planteles (operación: admin + encargado) ──────────────
// El encargado inscribe equipos y carga planteles el sábado a la mañana; no
// necesita entrar a Configuración para eso.

export async function addTeamAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = createTeamSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { tournamentId, ...team } = parsed.data
  let id: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      addTeam(tenant.id, user.staffUserId, tournamentId, team, tx),
    )
    id = row.id
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true, id }
}

/**
 * Autocomplete de capitán al anotar un equipo: busca entre los jugadores que
 * ya jugaron en este complejo (searchTenantPlayers). Es una lectura, así que
 * no revalida ninguna ruta.
 */
export async function searchPlayersForCaptainAction(
  input: unknown,
): Promise<SearchPlayersActionResult> {
  const parsed = searchPlayersForCaptainSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const players = await withTenantContext(tenant.id, (tx) =>
    searchTenantPlayers(tenant.id, parsed.data.query, tx),
  )

  return { success: true, players }
}

/**
 * Editar un equipo. Dos UIs, porque son dos momentos distintos:
 *  - estado y datos (nombre, capitán, arancel, notas) en `[id]/TeamsPanel.tsx`;
 *  - el número de siembra del sorteo de desempate en
 *    `[id]/posiciones/CorteZonasCard.tsx`, que es lo que destraba `seedPlayoffs`
 *    cuando dos equipos quedan empatados justo en el puesto de corte.
 *
 * Marcar `status: 'withdrawn'` es además el camino que los propios mensajes de
 * error indican cuando un equipo no se puede borrar (`mapTournamentError`).
 */
export async function updateTeamAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = updateTeamSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let tournamentId: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      updateTeam(tenant.id, user.staffUserId, parsed.data, tx),
    )
    tournamentId = row.tournamentId
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true }
}

export async function removeTeamAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = teamIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      removeTeam(tenant.id, user.staffUserId, parsed.data.id, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos()
  return { success: true }
}

export async function addTeamPlayerAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = createTeamPlayerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { teamId, ...player } = parsed.data
  try {
    await withTenantContext(tenant.id, (tx) =>
      addTeamPlayer(tenant.id, user.staffUserId, teamId, player, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos()
  return { success: true }
}

export async function removeTeamPlayerAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = teamPlayerIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      removeTeamPlayer(tenant.id, user.staffUserId, parsed.data.id, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos()
  return { success: true }
}

// ── Ocupación de la grilla (operación: admin + encargado) ───────────

export async function reserveSlotsAction(input: unknown): Promise<ReserveSlotsActionResult> {
  const parsed = reserveSlotsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { tournamentId, ...slots } = parsed.data
  let result: { reserved: number; conflicts: SlotConflict[] }
  try {
    result = await withTenantContext(tenant.id, (tx) =>
      reserveTournamentSlots(tenant.id, tournamentId, user.staffUserId, slots, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  // `conflicts` viaja aunque haya éxito: las horas salteadas se le muestran al
  // admin para que decida qué hacer con ellas.
  return { success: true, reserved: result.reserved, conflicts: result.conflicts }
}

// ── Fixture (operación: admin + encargado) ─────────────────────────

export async function generateFixtureAction(input: unknown): Promise<GenerateFixtureActionResult> {
  const parsed = generateFixtureSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const { tournamentId, ...opts } = parsed.data
  let result: { matches: number; unscheduled: number }
  try {
    result = await withTenantContext(tenant.id, (tx) =>
      generateFixture(tenant.id, user.staffUserId, tournamentId, opts, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  // `unscheduled` viaja aunque haya éxito: si no entraron todos, el admin tiene
  // que enterarse en vez de creer que quedó completo.
  return { success: true, matches: result.matches, unscheduled: result.unscheduled }
}

export async function clearFixtureAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = clearFixtureSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      clearFixture(tenant.id, user.staffUserId, parsed.data.tournamentId, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(parsed.data.tournamentId)
  return { success: true }
}

/**
 * Mover un partido a otra hora o cancha. UI: la Planilla
 * (`[id]/fixture/PlanillaBoard.tsx`).
 *
 * El `startsAt` no sale de un selector libre sino de un hueco del tablero, que
 * se calcula con la misma función que usa el generador
 * (`fixture/placement.ts`): así lo que se ofrece es siempre una hora que el
 * torneo posee, que es lo primero que valida `rescheduleMatch`.
 */
export async function rescheduleMatchAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = rescheduleMatchSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let tournamentId: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      rescheduleMatch(
        tenant.id,
        user.staffUserId,
        parsed.data.matchId,
        new Date(parsed.data.startsAt),
        parsed.data.courtId,
        tx,
      ),
    )
    tournamentId = row.tournamentId
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true }
}

export async function releaseSlotsAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = releaseSlotsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      releaseTournamentSlots(
        tenant.id,
        parsed.data.tournamentId,
        user.staffUserId,
        parsed.data.fromDate,
        tx,
      ),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(parsed.data.tournamentId)
  return { success: true }
}

// ─── Resultados y acta (migr. 065) ──────────────────────────────────
// El encargado carga resultados: requireOperatorStaff, no requireAdminStaff.

export async function saveMatchResultAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = saveMatchResultSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let tournamentId: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      saveMatchResult(tenant.id, user.staffUserId, parsed.data, tx),
    )
    tournamentId = row.tournamentId
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true }
}

export async function markWalkoverAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = markWalkoverSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let tournamentId: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      markWalkover(tenant.id, user.staffUserId, parsed.data, tx),
    )
    tournamentId = row.tournamentId
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true }
}

export async function clearMatchResultAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = clearMatchResultSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let tournamentId: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      clearMatchResult(tenant.id, user.staffUserId, parsed.data.matchId, tx),
    )
    tournamentId = row.tournamentId
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true }
}

export async function addMatchEventAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = addMatchEventSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let tournamentId: string
  try {
    const row = await withTenantContext(tenant.id, (tx) =>
      addMatchEvent(tenant.id, user.staffUserId, parsed.data, tx),
    )
    tournamentId = row.tournamentId
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true }
}

export async function deleteMatchEventAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = deleteMatchEventSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let tournamentId: string
  try {
    const res = await withTenantContext(tenant.id, (tx) =>
      deleteMatchEvent(tenant.id, user.staffUserId, parsed.data.eventId, tx),
    )
    tournamentId = res.tournamentId
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(tournamentId)
  return { success: true }
}

/**
 * Cerrar las zonas y sembrar el cuadro. Configuración: solo admin.
 *
 * UI: `[id]/posiciones/CorteZonasCard.tsx`. La tarjeta anticipa los tres
 * bloqueos que este camino puede tirar (partidos de zona pendientes, empate
 * irresoluble en el corte, rol insuficiente) en vez de dejar que el usuario los
 * descubra al apretar.
 */
export async function seedPlayoffsAction(input: unknown): Promise<TournamentActionResult> {
  const parsed = seedPlayoffsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    await withTenantContext(tenant.id, (tx) =>
      seedPlayoffs(tenant.id, user.staffUserId, parsed.data.tournamentId, tx),
    )
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    throw err
  }

  revalidateTorneos(parsed.data.tournamentId)
  return { success: true }
}

// ── Inscripciones (migr. 066) ───────────────────────────────────────
// Cobrar es operación de mostrador, no configuración: el encargado cobra la
// inscripción el sábado a la mañana igual que cobra un turno.

export async function registerInscriptionPaymentAction(
  input: unknown,
): Promise<TournamentActionResult> {
  const parsed = registerInscriptionPaymentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const off = await assertTournamentsEnabled(tenant.id)
  if (off) return { success: false, error: off }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // El equipo se relee adentro de la tx para saber a qué torneo revalidar: el
  // input solo trae el teamId.
  let tournamentId: string
  try {
    tournamentId = await withTenantContext(tenant.id, async (tx) => {
      const team = await getTeam(tenant.id, parsed.data.teamId, tx)
      await registerInscriptionPayment(tenant.id, user.staffUserId, parsed.data, tx)
      return team.tournamentId
    })
  } catch (err) {
    const mapped = mapTournamentError(err)
    if (mapped) return { success: false, error: mapped }
    // DayAlreadyClosedError viene de createCashFlow y se mapea ACÁ afuera para
    // que la transacción rollbackee en vez de commitear lo escrito antes.
    if (err instanceof DayAlreadyClosedError) {
      return {
        success: false,
        error: 'La caja de hoy ya fue cerrada. Registrá el cobro mañana o como ajuste en Caja.',
      }
    }
    throw err
  }

  revalidateTorneos(tournamentId)
  // El cobro es un movimiento de Caja: el listado del día lo muestra.
  revalidatePath('/caja')
  return { success: true }
}
