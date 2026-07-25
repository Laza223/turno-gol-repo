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
  removeTeam,
  removeTeamPlayer,
  updateTeam,
} from '@/modules/tournaments/tournament-team.service'
import {
  releaseTournamentSlots,
  reserveTournamentSlots,
} from '@/modules/tournaments/tournament-slots.service'
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
  clearFixtureSchema,
  generateFixtureSchema,
  rescheduleMatchSchema,
} from '@/modules/tournaments/tournament.schema'
import {
  CourtSlotTakenError,
  DuplicateShirtNumberError,
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
  | { success: true; id?: string }
  | { success: false; error: string }

export type ReserveSlotsActionResult =
  | { success: true; reserved: number; conflicts: SlotConflict[] }
  | { success: false; error: string }

export type GenerateFixtureActionResult =
  | { success: true; matches: number; unscheduled: number }
  | { success: false; error: string }

function revalidateTorneos(id?: string): void {
  revalidatePath('/torneos')
  if (id) {
    revalidatePath(`/torneos/${id}`)
    revalidatePath(`/torneos/${id}/fixture`)
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

export async function createTournamentAction(
  input: unknown,
): Promise<TournamentActionResult> {
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

export async function updateTournamentAction(
  input: unknown,
): Promise<TournamentActionResult> {
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

export async function deleteTournamentAction(
  input: unknown,
): Promise<TournamentActionResult> {
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

export async function addTeamPlayerAction(
  input: unknown,
): Promise<TournamentActionResult> {
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

export async function removeTeamPlayerAction(
  input: unknown,
): Promise<TournamentActionResult> {
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

export async function reserveSlotsAction(
  input: unknown,
): Promise<ReserveSlotsActionResult> {
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

export async function generateFixtureAction(
  input: unknown,
): Promise<GenerateFixtureActionResult> {
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

export async function clearFixtureAction(
  input: unknown,
): Promise<TournamentActionResult> {
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

export async function rescheduleMatchAction(
  input: unknown,
): Promise<TournamentActionResult> {
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

export async function releaseSlotsAction(
  input: unknown,
): Promise<TournamentActionResult> {
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
