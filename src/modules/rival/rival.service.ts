import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { buildWhatsappUrl } from '@/lib/whatsapp'
import { publicTenantVisibilityConds } from '@/modules/tenants/search.service'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { uuid } from '@/shared/validation/primitives'
import { artDateOf, artDayRangeUtc } from '@/shared/time/art-date'
import { getDb, withPlayerContext, type DbTx } from '@/shared/db/client'
import {
  bookings,
  courts,
  players,
  rivalMatchContacts,
  rivalMatches,
  rivalParticipants,
  rivalReports,
  tenants,
} from '@/shared/db/schema'
import { mapRivalDbError, RivalError } from './rival.errors'
import {
  inviteCodeSchema,
  type RivalBoardDraft,
  type RivalMatchDraft,
  type RivalReportReason,
  type RivalWelcomeInput,
} from './rival.schema'
import { artTimeOf } from './rival-display'
import type { NewMatchBooking, RepeatSource } from './rival-form'
import { scheduleRivalMail } from './rival-mail.service'
import { rivalLastStartDay } from './rival-window'
import type {
  RivalBoardCursor,
  RivalBoardItem,
  RivalBoardPage,
  RivalJoinResult,
  RivalLevel,
  RivalMatchStatus,
  RivalMyMatch,
  RivalParticipantOrigin,
  RivalParticipantRole,
  RivalParticipantStatus,
  RivalPosition,
  RivalPublicMatch,
  RivalRosterEntry,
  RivalSeeking,
  RivalSeekingPosition,
} from './rival.types'

/**
 * Versión vigente de las reglas de RIVAL que el jugador acepta en la bienvenida
 * (`players.rival_terms_version`). Subirla obliga a aceptar de nuevo antes de
 * organizar, sumarse o pedir sumarse.
 */
export const RIVAL_TERMS_VERSION = 'rival-2026-10-22'

const ART_TZ = 'America/Argentina/Buenos_Aires'
const BOARD_PAGE_DEFAULT = 30
const BOARD_PAGE_MAX = 50

type Row = Record<string, unknown>

/**
 * Todo lo de RIVAL corre en `withPlayerContext`: la RLS y los triggers de la 099
 * leen `app.current_player_id`. Además cada función filtra por `player_id` /
 * `organizer_player_id` por su cuenta (defensa en profundidad: la RLS no es la
 * única barrera). Un error de la base sale como `RivalError`; lo que no es de
 * RIVAL (infraestructura) sube tal cual.
 *
 * El `await` va DENTRO del try: el COMMIT también puede fallar (el trigger
 * diferido `rival_contact_required` salta ahí).
 */
async function inPlayerContext<T>(playerId: string, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  try {
    return await withPlayerContext(playerId, fn)
  } catch (err) {
    throw mapRivalDbError(err) ?? err
  }
}

/** Lecturas sin sesión (tablón y link público): un `execute` suelto, sin `app.current_player_id`. */
async function publicRead<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw mapRivalDbError(err) ?? err
  }
}

// `tx.execute` devuelve timestamptz como string (ver client.ts): siempre `new Date(String(x))`.
const toDate = (v: unknown): Date => new Date(String(v))
const toDateOrNull = (v: unknown): Date | null => (v == null ? null : toDate(v))
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v))

function toMatchBase(r: Row): Omit<RivalPublicMatch, 'tenantCity'> {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    tenantName: String(r.tenant_name),
    tenantSlug: String(r.tenant_slug),
    startsAt: toDate(r.starts_at),
    format: Number(r.format),
    capacity: Number(r.capacity),
    level: r.level as RivalLevel,
    status: r.status as RivalMatchStatus,
    seeking: (r.seeking ?? null) as RivalSeeking | null,
    seekingPosition: (r.seeking_position ?? null) as RivalSeekingPosition | null,
    confirmedCount: Number(r.confirmed_count),
    filledAt: toDateOrNull(r.filled_at),
    courtDeclared: Boolean(r.court_declared),
    hasStamp: Boolean(r.has_stamp),
    isOrganizer: Boolean(r.is_organizer),
  }
}

function toPublicMatch(r: Row): RivalPublicMatch {
  return { ...toMatchBase(r), tenantCity: String(r.tenant_city) }
}

function toBoardItem(r: Row): RivalBoardItem {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    tenantName: String(r.tenant_name),
    tenantSlug: String(r.tenant_slug),
    startsAt: toDate(r.starts_at),
    format: Number(r.format),
    capacity: Number(r.capacity),
    level: r.level as RivalLevel,
    seeking: r.seeking as RivalSeeking,
    seekingPosition: (r.seeking_position ?? null) as RivalSeekingPosition | null,
    confirmedCount: Number(r.confirmed_count),
    hasStamp: Boolean(r.has_stamp),
  }
}

/** El jugador tiene que haber aceptado la bienvenida de la versión vigente. */
async function requireWelcome(tx: DbTx, playerId: string): Promise<void> {
  const [row] = await tx
    .select({ at: players.rivalAcceptedAt, version: players.rivalTermsVersion })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1)
  if (!row || row.at === null || row.version !== RIVAL_TERMS_VERSION) {
    throw new RivalError('rival_welcome_required')
  }
}

/** Arma un partido. Si va al tablón, el contacto se crea en la MISMA transacción (lo exige un trigger diferido). */
export async function createMatch(
  playerId: string,
  draft: RivalMatchDraft,
): Promise<{ id: string; inviteCode: string }> {
  const created = await inPlayerContext(playerId, async (tx) => {
    await requireWelcome(tx, playerId)

    // Mismo filtro de visibilidad que la búsqueda pública: nada de partidos en
    // complejos que un jugador no podría encontrar.
    const [tenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.id, draft.tenantId), ...publicTenantVisibilityConds()))
      .limit(1)
    if (!tenant) throw new RivalError('rival_tenant_unavailable')

    const board = draft.board
    const [match] = await tx
      .insert(rivalMatches)
      .values({
        tenantId: draft.tenantId,
        organizerPlayerId: playerId,
        bookingId: draft.bookingId,
        courtDeclared: draft.courtDeclared,
        startsAt: draft.startsAt,
        format: draft.format,
        capacity: draft.capacity,
        level: draft.level,
        onBoard: board !== null,
        seeking: board?.seeking ?? null,
        seekingPosition: board?.seekingPosition ?? null,
      })
      .returning({ id: rivalMatches.id, inviteCode: rivalMatches.inviteCode })
    if (!match) throw new RivalError('rival_forbidden')

    if (board) {
      await tx
        .insert(rivalMatchContacts)
        .values({ matchId: match.id, whatsappDigits: board.whatsappDigits })
    }
    return match
  })
  // Post-commit y sin lanzar: el mail nunca tumba la acción ni corre dentro de la transacción.
  if (draft.board) await scheduleRivalMail({ type: 'alert_publish', matchId: created.id })
  return created
}

/** Publica (o cambia lo que busca) un partido propio. El WhatsApp se confirma en cada publicación. */
export async function publishToBoard(
  playerId: string,
  matchId: string,
  board: RivalBoardDraft,
): Promise<void> {
  await inPlayerContext(playerId, async (tx) => {
    if (board.seeking === 'rival') {
      const [own] = await tx
        .select({ capacity: rivalMatches.capacity, format: rivalMatches.format })
        .from(rivalMatches)
        .where(and(eq(rivalMatches.id, matchId), eq(rivalMatches.organizerPlayerId, playerId)))
        .limit(1)
      if (!own) throw new RivalError('rival_not_found')
      if (own.capacity !== own.format) throw new RivalError('rival_capacity_mismatch')
    }
    const updated = await tx
      .update(rivalMatches)
      .set({ onBoard: true, seeking: board.seeking, seekingPosition: board.seekingPosition })
      .where(and(eq(rivalMatches.id, matchId), eq(rivalMatches.organizerPlayerId, playerId)))
      .returning({ id: rivalMatches.id })
    if (updated.length === 0) throw new RivalError('rival_not_found')

    await tx
      .insert(rivalMatchContacts)
      .values({ matchId, whatsappDigits: board.whatsappDigits })
      .onConflictDoUpdate({
        target: rivalMatchContacts.matchId,
        set: { whatsappDigits: board.whatsappDigits },
      })
  })
  await scheduleRivalMail({ type: 'alert_publish', matchId })
}

/** Saca el partido del tablón (queda solo el grupo). El contacto de los ya aceptados no se toca. */
export async function unpublishFromBoard(playerId: string, matchId: string): Promise<void> {
  await inPlayerContext(playerId, async (tx) => {
    const updated = await tx
      .update(rivalMatches)
      .set({ onBoard: false, seeking: null, seekingPosition: null })
      .where(and(eq(rivalMatches.id, matchId), eq(rivalMatches.organizerPlayerId, playerId)))
      .returning({ id: rivalMatches.id })
    if (updated.length === 0) throw new RivalError('rival_not_found')
  })
}

/** Cancela el partido (solo el organizador). La base borra el WhatsApp guardado. */
export async function cancelMatch(playerId: string, matchId: string): Promise<void> {
  await inPlayerContext(playerId, async (tx) => {
    const updated = await tx
      .update(rivalMatches)
      .set({ status: 'canceled' })
      .where(and(eq(rivalMatches.id, matchId), eq(rivalMatches.organizerPlayerId, playerId)))
      .returning({ id: rivalMatches.id })
    if (updated.length === 0) throw new RivalError('rival_not_found')
  })
  await scheduleRivalMail({ type: 'canceled', matchId })
}

/** "Voy" por link. Idempotente. Con cupo entra confirmado, sin cupo al banco. */
export async function joinByInvite(playerId: string, code: string): Promise<RivalJoinResult> {
  const parsed = inviteCodeSchema.safeParse(code)
  if (!parsed.success) throw new RivalError('rival_not_found')
  return inPlayerContext(playerId, async (tx) => {
    await requireWelcome(tx, playerId)
    const rows = (await tx.execute(
      sql`SELECT * FROM rival_join_by_invite(${parsed.data})`,
    )) as unknown as Row[]
    const r = rows[0]
    if (!r) throw new RivalError('rival_not_found')
    return {
      participantId: String(r.participant_id),
      matchId: String(r.match_id),
      status: r.status as RivalParticipantStatus,
      joined: Boolean(r.joined),
    }
  })
}

/**
 * Pedido del tablón. `tenantId` viene de la tarjeta del tablón y solo cumple el
 * NOT NULL del INSERT: el trigger lo pisa con el complejo real del partido.
 */
export async function requestToJoin(
  playerId: string,
  input: { matchId: string; tenantId: string },
): Promise<{ participantId: string }> {
  const result = await inPlayerContext(playerId, async (tx) => {
    await requireWelcome(tx, playerId)
    const [row] = await tx
      .insert(rivalParticipants)
      .values({
        tenantId: input.tenantId,
        matchId: input.matchId,
        playerId,
        status: 'requested',
        origin: 'board',
      })
      .returning({ id: rivalParticipants.id })
    if (!row) throw new RivalError('rival_forbidden')
    return { participantId: row.id }
  })
  await scheduleRivalMail({
    type: 'join_request',
    matchId: input.matchId,
    participantId: result.participantId,
  })
  return result
}

/**
 * Orden único de locks: la fila del partido ANTES que la de cualquier
 * participante. La baja de un confirmado promueve al banco (partido -> banco);
 * si otra baja ya tenía tomada la fila del banco y esperaba al partido, Postgres
 * mata una de las dos con 40P01. Ver "Orden de locks" en la migración 099.
 */
async function lockMatch(tx: DbTx, matchId: string): Promise<void> {
  await tx.execute(sql`SELECT rival_lock_match(${matchId}::uuid)`)
}

/** Cambia el estado de una fila del plantel de un partido PROPIO (acepta, rechaza, saca). */
async function updateParticipantAsOrganizer(
  organizerId: string,
  participantId: string,
  status: 'confirmed' | 'declined' | 'removed',
): Promise<string> {
  return inPlayerContext(organizerId, async (tx) => {
    // Sin lock: solo se resuelve el partido de la fila para tomarlo primero.
    const [target] = await tx
      .select({ matchId: rivalParticipants.matchId })
      .from(rivalParticipants)
      .where(eq(rivalParticipants.id, participantId))
      .limit(1)
    if (!target) throw new RivalError('rival_not_found')
    await lockMatch(tx, target.matchId)

    const own = tx
      .select({ id: rivalMatches.id })
      .from(rivalMatches)
      .where(eq(rivalMatches.organizerPlayerId, organizerId))
    const updated = await tx
      .update(rivalParticipants)
      .set({ status })
      .where(and(eq(rivalParticipants.id, participantId), inArray(rivalParticipants.matchId, own)))
      .returning({ id: rivalParticipants.id })
    if (updated.length === 0) throw new RivalError('rival_not_found')
    return target.matchId
  })
}

/** El organizador acepta o rechaza un pedido del tablón. Aceptar exige cupo (`rival_full`). */
export async function decideRequest(
  organizerId: string,
  participantId: string,
  decision: 'accept' | 'decline',
): Promise<void> {
  const matchId = await updateParticipantAsOrganizer(
    organizerId,
    participantId,
    decision === 'accept' ? 'confirmed' : 'declined',
  )
  // Un rechazo no manda mail (spec §5.7.4): solo el aceptado se entera.
  if (decision === 'accept') await scheduleRivalMail({ type: 'accepted', matchId, participantId })
}

/** El organizador saca a alguien confirmado o del banco; entra el primero del banco. */
export async function removeParticipant(organizerId: string, participantId: string): Promise<void> {
  await updateParticipantAsOrganizer(organizerId, participantId, 'removed')
}

/** "Me bajo" (confirmado, banco o pedido). Si había banco, entra el primero. */
export async function leaveMatch(playerId: string, matchId: string): Promise<void> {
  await inPlayerContext(playerId, async (tx) => {
    await lockMatch(tx, matchId)
    const updated = await tx
      .update(rivalParticipants)
      .set({ status: 'left' })
      .where(and(eq(rivalParticipants.matchId, matchId), eq(rivalParticipants.playerId, playerId)))
      .returning({ id: rivalParticipants.id })
    if (updated.length === 0) throw new RivalError('rival_not_found')
  })
}

/**
 * Datos del partido por su link, sin personas. Sin `viewerId` sirve sin sesión.
 * `null` si el código no existe, no tiene formato de código o el partido está
 * oculto (salvo para su organizador).
 */
export async function getPublicMatch(
  code: string,
  viewerId?: string | null,
): Promise<RivalPublicMatch | null> {
  const parsed = inviteCodeSchema.safeParse(code)
  if (!parsed.success) return null
  const query = sql`SELECT * FROM rival_public_match(${parsed.data})`
  const rows = viewerId
    ? await inPlayerContext(viewerId, async (tx) => (await tx.execute(query)) as unknown as Row[])
    : await publicRead(async () => (await getDb().execute(query)) as unknown as Row[])
  const r = rows[0]
  return r ? toPublicMatch(r) : null
}

/** El tablón: solo publicados, abiertos, visibles y con algo que buscar. Paginado por cursor (hora, id). */
export async function listBoard(
  params: { tenantId?: string | null; after?: RivalBoardCursor | null; limit?: number } = {},
): Promise<RivalBoardPage> {
  const limit = Math.min(Math.max(params.limit ?? BOARD_PAGE_DEFAULT, 1), BOARD_PAGE_MAX)
  const afterAt = params.after ? params.after.startsAt.toISOString() : null
  const afterId = params.after?.id ?? null
  const rows = await publicRead(
    async () =>
      (await getDb().execute(sql`
        SELECT * FROM rival_board(
          ${params.tenantId ?? null}::uuid,
          ${afterAt}::timestamptz,
          ${afterId}::uuid,
          ${limit + 1}::int
        )
      `)) as unknown as Row[],
  )
  const items: RivalBoardItem[] = rows.slice(0, limit).map(toBoardItem)
  const last = items[items.length - 1]
  const nextCursor: RivalBoardCursor | null =
    rows.length > limit && last ? { startsAt: last.startsAt, id: last.id } : null
  return { items, nextCursor }
}

/**
 * Una tarjeta del tablón por id (vista pública `/rival/partido/<id>`). Mismos filtros que
 * `listBoard` (los aplica `rival_board_match`): `null` si no está publicado, está oculto,
 * cancelado, vencido, lleno buscando jugadores, o si el id no es un uuid.
 */
export async function getBoardMatch(matchId: string): Promise<RivalBoardItem | null> {
  if (!uuid.safeParse(matchId).success) return null
  const rows = await publicRead(
    async () =>
      (await getDb().execute(
        sql`SELECT * FROM rival_board_match(${matchId}::uuid)`,
      )) as unknown as Row[],
  )
  const r = rows[0]
  return r ? toBoardItem(r) : null
}

/** Complejos con al menos un partido visible en el tablón, por nombre (el filtro de la página). */
export async function listBoardTenants(): Promise<{ id: string; name: string }[]> {
  const rows = await publicRead(
    async () =>
      (await getDb().execute(sql`SELECT * FROM rival_board_tenants()`)) as unknown as Row[],
  )
  return rows.map((r) => ({ id: String(r.id), name: String(r.name) }))
}

/**
 * Plantel visible para `playerId` según la spec §6 (lo decide la base). `inviteCode`
 * es el del link: con él, quien no participa ve a los confirmados.
 */
export async function getRoster(
  playerId: string,
  matchId: string,
  inviteCode?: string | null,
): Promise<RivalRosterEntry[]> {
  const code = inviteCode ? inviteCodeSchema.safeParse(inviteCode) : null
  return inPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT * FROM rival_roster(${matchId}::uuid, ${code?.success ? code.data : null}::text)`,
    )) as unknown as Row[]
    return rows.map((r) => ({
      participantId: String(r.participant_id),
      playerId: String(r.player_id),
      role: r.role as RivalParticipantRole,
      status: r.status as RivalParticipantStatus,
      origin: r.origin as RivalParticipantOrigin,
      isMe: Boolean(r.is_me),
      shortName: String(r.short_name),
      avatarUrl: strOrNull(r.avatar_url),
      confirmedAt: toDateOrNull(r.confirmed_at),
      position: (r.position ?? null) as RivalPosition | null,
      zone: strOrNull(r.zone),
      gamesPlayed: r.games_played == null ? null : Number(r.games_played),
      memberSince: toDateOrNull(r.member_since),
    }))
  })
}

/**
 * "Escribile por WhatsApp" del aceptado desde el tablón (spec §5.7): el `wa.me`
 * al organizador, armado acá con el texto fijo. `null` si la base no deja leer
 * el contacto (no sos un aceptado del tablón, el partido se cayó o ya empezó) o
 * si sos el organizador (no tiene sentido un link a tu propio número).
 */
export async function getContactLink(playerId: string, matchId: string): Promise<string | null> {
  return inPlayerContext(playerId, async (tx) => {
    // El partido sale de rival_my_matches(): un participante no lee la fila de
    // rival_matches (tiene el invite_code). La RLS de rival_match_contacts decide
    // si puede leer el número.
    const rows = (await tx.execute(sql`
      SELECT c.whatsapp_digits, m.starts_at, m.tenant_name, p.first_name
      FROM rival_my_matches() m
      JOIN rival_match_contacts c ON c.match_id = m.id
      JOIN players p ON p.id = ${playerId}::uuid
      WHERE m.id = ${matchId}::uuid
        AND NOT m.is_organizer
    `)) as unknown as Row[]
    const r = rows[0]
    if (!r) return null
    const startsAt = toDate(r.starts_at)
    const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: ART_TZ }).format(
      startsAt,
    )
    const time = new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: ART_TZ,
    }).format(startsAt)
    const text = `Hola, soy ${String(r.first_name)} de RIVAL. Me aceptaste para el partido del ${weekday} ${time} en ${String(r.tenant_name)}.`
    return buildWhatsappUrl(String(r.whatsapp_digits), text)
  })
}

async function insertReport(
  playerId: string,
  matchId: string,
  reason: RivalReportReason,
  reportedPlayerId: string | null,
): Promise<void> {
  await inPlayerContext(playerId, async (tx) => {
    await tx.insert(rivalReports).values({
      matchId,
      reporterPlayerId: playerId,
      reportedPlayerId,
      reason,
    })
  })
}

/** Denuncia un partido. 3 denunciantes que cuentan lo ocultan solos (lo decide la base). */
export function reportMatch(
  playerId: string,
  matchId: string,
  reason: RivalReportReason,
): Promise<void> {
  return insertReport(playerId, matchId, reason, null)
}

/** Denuncia a una persona dentro de un partido (que tiene que estar en el plantel). */
export function reportPlayer(
  playerId: string,
  matchId: string,
  reportedPlayerId: string,
  reason: RivalReportReason,
): Promise<void> {
  return insertReport(playerId, matchId, reason, reportedPlayerId)
}

/** Bienvenida RIVAL: guarda nombre, posición, zona y el clickwrap versionado. */
export async function acceptRivalWelcome(
  playerId: string,
  input: RivalWelcomeInput,
): Promise<void> {
  await inPlayerContext(playerId, async (tx) => {
    const updated = await tx
      .update(players)
      .set({
        firstName: input.firstName,
        position: input.position,
        zone: input.zone,
        rivalAcceptedAt: sql`now()`,
        rivalTermsVersion: RIVAL_TERMS_VERSION,
      })
      .where(and(eq(players.id, playerId), eq(players.status, 'active')))
      .returning({ id: players.id })
    if (updated.length === 0) throw new RivalError('rival_forbidden')
  })
}

function toMyMatch(r: Row): RivalMyMatch {
  return {
    ...toMatchBase(r),
    onBoard: Boolean(r.on_board),
    inviteCode: strOrNull(r.invite_code),
    isHidden: Boolean(r.is_hidden),
    participantId: strOrNull(r.participant_id),
    myRole: (r.my_role ?? null) as RivalParticipantRole | null,
    myStatus: (r.my_status ?? null) as RivalParticipantStatus | null,
    myOrigin: (r.my_origin ?? null) as RivalParticipantOrigin | null,
  }
}

/**
 * "Mis partidos": los que organizo y en los que estoy, en cualquier estado de
 * participante (también el pedido pendiente o rechazado). Los próximos arriba.
 * Va por `rival_my_matches()` porque la RLS de `rival_matches` no deja leer el
 * partido a quien solo pidió sumarse.
 */
export async function listMyMatches(playerId: string): Promise<RivalMyMatch[]> {
  return inPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`SELECT * FROM rival_my_matches()`)) as unknown as Row[]
    return rows.map(toMyMatch)
  })
}

/** Un partido de "Mis partidos" por id (organizador o participante en cualquier estado). `null` si no es mío. */
export async function getMyMatch(playerId: string, matchId: string): Promise<RivalMyMatch | null> {
  if (!uuid.safeParse(matchId).success) return null
  return inPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT * FROM rival_my_matches() WHERE id = ${matchId}::uuid`,
    )) as unknown as Row[]
    const r = rows[0]
    return r ? toMyMatch(r) : null
  })
}

/** Para precargar el WhatsApp del form de publicar: el `players.phone` tal cual, sin normalizar. */
export async function getBoardPublishPrefill(
  playerId: string,
): Promise<{ whatsapp: string | null }> {
  return inPlayerContext(playerId, async (tx) => {
    const [row] = await tx
      .select({ phone: players.phone })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1)
    return { whatsapp: row?.phone ?? null }
  })
}

/**
 * Complejos donde se puede armar un partido: los mismos que encuentra la búsqueda
 * pública (`publicTenantVisibilityConds`, el filtro que también aplica `createMatch`).
 * `tenants` es global y sin RLS: no hace falta contexto de jugador.
 */
export async function listEligibleTenants(): Promise<{ id: string; name: string; city: string }[]> {
  return publicRead(() =>
    getDb()
      .select({ id: tenants.id, name: tenants.name, city: tenants.city })
      .from(tenants)
      .where(and(...publicTenantVisibilityConds()))
      .orderBy(asc(tenants.name))
      .limit(200),
  )
}

/**
 * Reservas `confirmed` y futuras DEL jugador (hoy..+7 en ART, la misma ventana que admite el schema): sirven para vincular el
 * partido (sello "Reservada en TurnoGol") y para precargar desde `?reserva=<id>`. El
 * filtro por `player_id` va además de la RLS.
 */
export async function listUpcomingConfirmedBookings(playerId: string): Promise<NewMatchBooking[]> {
  const { toUtc } = artDayRangeUtc(artTodayStr(), rivalLastStartDay())
  return inPlayerContext(playerId, (tx) =>
    tx
      .select({
        id: bookings.id,
        tenantId: bookings.tenantId,
        startsAt: bookings.startsAt,
        format: courts.format,
      })
      .from(bookings)
      .innerJoin(courts, eq(courts.id, bookings.courtId))
      .where(
        and(
          eq(bookings.playerId, playerId),
          eq(bookings.status, 'confirmed'),
          gt(bookings.startsAt, sql`now()`),
          lt(bookings.startsAt, toUtc),
        ),
      )
      .orderBy(asc(bookings.startsAt)),
  )
}

/**
 * "Repetir" (spec §5.5): los datos de un partido PROPIO con el día corrido +7 (ART). `null` si el
 * partido no existe o no es del jugador (el filtro por organizador va además de la RLS).
 */
export async function getRepeatPrefill(
  playerId: string,
  matchId: string,
): Promise<RepeatSource | null> {
  if (!uuid.safeParse(matchId).success) return null
  return inPlayerContext(playerId, async (tx) => {
    const [m] = await tx
      .select({
        tenantId: rivalMatches.tenantId,
        startsAt: rivalMatches.startsAt,
        format: rivalMatches.format,
        capacity: rivalMatches.capacity,
        level: rivalMatches.level,
      })
      .from(rivalMatches)
      .where(and(eq(rivalMatches.id, matchId), eq(rivalMatches.organizerPlayerId, playerId)))
      .limit(1)
    if (!m) return null
    return {
      tenantId: m.tenantId,
      date: addDays(artDateOf(m.startsAt), 7),
      time: artTimeOf(m.startsAt),
      format: m.format,
      capacity: m.capacity,
      level: m.level,
    }
  })
}

/** Lo que la bienvenida necesita: el nombre actual y si ya aceptó la versión vigente. */
export async function getRivalWelcomeState(playerId: string): Promise<{
  firstName: string
  welcomed: boolean
  position: RivalPosition | null
  zone: string | null
} | null> {
  return inPlayerContext(playerId, async (tx) => {
    const [row] = await tx
      .select({
        firstName: players.firstName,
        at: players.rivalAcceptedAt,
        version: players.rivalTermsVersion,
        position: players.position,
        zone: players.zone,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1)
    if (!row) return null
    return {
      firstName: row.firstName,
      welcomed: row.at !== null && row.version === RIVAL_TERMS_VERSION,
      position: row.position,
      zone: row.zone,
    }
  })
}
