'use server'

import { revalidatePath } from 'next/cache'
import { notFound as notFoundPage, redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { RivalError, type RivalErrorCode } from '@/modules/rival/rival.errors'
import {
  inviteCodeSchema,
  rivalIdentitySchema,
  rivalProfileSchema,
  rivalZoneSchema,
  rivalReportSchema,
  type RivalProfileUpdate,
  type RivalReportReason,
} from '@/modules/rival/rival.schema'
import {
  collectFieldErrors,
  parseBoardForm,
  parseNewMatchForm,
  type RivalFieldErrors,
  type RivalFormResult,
} from '@/modules/rival/rival-form'
import { welcomeNeeds } from '@/modules/rival/rival-join-rule'
import {
  subscribeAlert,
  unsubscribeAlert,
  unsubscribeByToken,
} from '@/modules/rival/rival-alerts.service'
import {
  RIVAL_DISABLED_MESSAGE,
  RIVAL_NO_SESSION_MESSAGE,
  RIVAL_RATE_LIMITED_MESSAGE,
  rivalErrorMessage,
} from '@/modules/rival/rival-copy'
import {
  acceptRivalWelcome,
  cancelMatch,
  completeRivalProfile,
  createMatch,
  decideRequest,
  getBoardMatch,
  getMyMatch,
  getRivalWelcomeState,
  joinByInvite,
  leaveMatch,
  listUpcomingConfirmedBookings,
  publishToBoard,
  removeParticipant,
  reportMatch,
  reportPlayer,
  requestToJoin,
  unpublishFromBoard,
} from '@/modules/rival/rival.service'
import { captureException } from '@/lib/sentry'
import { clearRivalIntentCookie } from './p/[code]/rival-intent.server'
import { uuid } from '@/shared/validation/primitives'
import { enforce } from '@/shared/rate-limit'
import type { PolicyName } from '@/shared/rate-limit/policies'
import type { ActionResult } from '@/shared/types/action-result'

export type { RivalFormResult } from '@/modules/rival/rival-form'

type Failure = Extract<RivalFormResult, { success: false }>

/**
 * Orden de toda action de RIVAL: flag → sesión de jugador → rate limit. Sin flag es como si
 * la acción no existiera. Devuelve el `playerId` o el resultado de error ya armado (la sesión
 * vencida lleva `code: 'no_session'` para que la vista ofrezca ingresar).
 */
async function guard(policy: PolicyName): Promise<{ playerId: string } | Failure> {
  if (!(await isRivalEnabled())) return { success: false, error: RIVAL_DISABLED_MESSAGE }
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') {
    return { success: false, error: RIVAL_NO_SESSION_MESSAGE, code: 'no_session' }
  }
  const rl = await enforce(policy, user.playerId)
  if (!rl.ok) return { success: false, error: RIVAL_RATE_LIMITED_MESSAGE }
  return { playerId: user.playerId }
}

/** El partido o el pedido cambió desde que la vista se dibujó: hay que mostrarle el estado real. */
const STALE_CODES: ReadonlySet<RivalErrorCode> = new Set([
  'rival_not_found',
  'rival_expired',
  'rival_canceled',
  'rival_full',
  'rival_forbidden_transition',
  'rival_not_on_board',
  'rival_hidden',
  'rival_captain_taken',
  // Cambió la versión de las reglas o el perfil con la pestaña abierta: la vista pide la tarjeta.
  'rival_welcome_required',
  'rival_profile_required',
])

/** Topes con salida en la vista: "Ver mis partidos". */
const LIMIT_CODES: ReadonlySet<RivalErrorCode> = new Set([
  'rival_limit_active',
  'rival_limit_requests',
])

/**
 * Error de service → texto. Lo que no es de RIVAL (infraestructura) va a Sentry y sale genérico. Un
 * error de estado vencido refresca la vista, así el botón obsoleto desaparece.
 */
function failure(err: unknown): Failure {
  if (!(err instanceof RivalError)) {
    captureException(err)
    return { success: false, error: rivalErrorMessage(err) }
  }
  if (STALE_CODES.has(err.code)) revalidatePath('/rival', 'layout')
  return {
    success: false,
    error: rivalErrorMessage(err),
    ...(LIMIT_CODES.has(err.code) ? { code: err.code } : {}),
  }
}

/** Resultado de un parse de form fallido → el del form: el primer error y todos por campo. */
function invalid(p: { error: string; field?: string; fieldErrors: RivalFieldErrors }): Failure {
  return {
    success: false,
    error: p.error,
    ...(p.field ? { field: p.field } : {}),
    fieldErrors: p.fieldErrors,
  }
}

type WelcomeParse =
  | { ok: true; identity?: { firstName: string }; profile?: RivalProfileUpdate }
  | { ok: false; result: Failure }

/** Valida solo lo que la bienvenida pide en este momento (nombre y/o posición y zona). */
function parseWelcome(
  formData: FormData,
  needs: { identity: boolean; profile: boolean; position: boolean },
): WelcomeParse {
  // La tarjeta se dibujó sin el campo posición (el partido cambió con la pestaña abierta): un error de
  // campo no tendría dónde pintarse. Se refresca la vista para que pida lo que falta.
  if (needs.profile && needs.position && !formData.has('position')) {
    return { ok: false, result: failure(new RivalError('rival_profile_required')) }
  }
  const identity = needs.identity
    ? rivalIdentitySchema.safeParse({ firstName: formData.get('firstName') })
    : null
  const profile = needs.profile
    ? needs.position
      ? rivalProfileSchema.safeParse({
          position: formData.get('position'),
          zone: formData.get('zone'),
        })
      : rivalZoneSchema.safeParse({ zone: formData.get('zone') })
    : null
  const issues = [
    ...(identity && !identity.success ? identity.error.issues : []),
    ...(profile && !profile.success ? profile.error.issues : []),
  ]
  if (issues.length > 0) {
    const field = issues[0]?.path[0]
    return {
      ok: false,
      result: invalid({
        error: issues[0]?.message ?? 'Revisá tus datos.',
        ...(typeof field === 'string' ? { field } : {}),
        fieldErrors: collectFieldErrors(issues),
      }),
    }
  }
  return {
    ok: true,
    ...(identity?.success ? { identity: identity.data } : {}),
    ...(profile?.success ? { profile: profile.data } : {}),
  }
}

/** Sin las reglas aceptadas estampa el consentimiento; con ellas, solo completa posición y zona. */
async function saveWelcome(
  playerId: string,
  welcome: Extract<WelcomeParse, { ok: true }>,
): Promise<void> {
  if (welcome.identity)
    await acceptRivalWelcome(playerId, { ...welcome.identity, ...welcome.profile })
  else if (welcome.profile) await completeRivalProfile(playerId, welcome.profile)
}

/**
 * Bienvenida para ARMAR (§7, primer momento): solo el nombre y las reglas en un toque. La
 * posición y la zona se piden recién al sumarse.
 */
export async function acceptRivalWelcomeAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g

  const welcome = parseWelcome(formData, { identity: true, profile: false, position: false })
  if (!welcome.ok) return welcome.result
  try {
    await saveWelcome(g.playerId, welcome)
  } catch (err) {
    return failure(err)
  }
  // La page vuelve a leer la bienvenida y muestra el formulario.
  revalidatePath('/rival/nuevo')
  return { success: true }
}

/**
 * Bienvenida para SUMARSE (segundo momento). Lee del servidor qué falta, sin confiar en lo que
 * mandó el cliente: sin las reglas aceptadas estampa el consentimiento; con las reglas y sin
 * perfil solo completa posición y zona (NO re-estampa el consentimiento). `null` = ya puede sumarse.
 */
async function completeWelcomeToJoin(
  playerId: string,
  formData: FormData,
  purpose: 'sumarse' | 'desafiar',
): Promise<Failure | null> {
  const state = await getRivalWelcomeState(playerId)
  if (!state) throw new RivalError('rival_forbidden')
  const needs = welcomeNeeds(state, purpose)
  if (!needs) return null
  const welcome = parseWelcome(formData, needs)
  if (!welcome.ok) return welcome.result
  await saveWelcome(playerId, welcome)
  return null
}

/** Gasta el intento de "Voy" (cookie de Google) y refresca la vista del partido y Mis partidos. */
async function afterJoin(): Promise<void> {
  await clearRivalIntentCookie()
  revalidatePath('/rival', 'layout')
}

/** "Voy" con la bienvenida ya aceptada (§5.2). Idempotente: tocarlo estando adentro no cambia nada. */
export async function joinMatchAction(code: string): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const parsed = inviteCodeSchema.safeParse(code)
  if (!parsed.success)
    return { success: false, error: rivalErrorMessage(new RivalError('rival_not_found')) }
  try {
    await joinByInvite(g.playerId, parsed.data)
  } catch (err) {
    return failure(err)
  } finally {
    await afterJoin()
  }
  return { success: true }
}

/** "Estoy adentro" (§5.2): completa la bienvenida que falte y suma en un solo toque. El código viaja en el form. */
export async function acceptWelcomeAndJoinAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g

  const code = inviteCodeSchema.safeParse(formData.get('code'))
  if (!code.success)
    return { success: false, error: rivalErrorMessage(new RivalError('rival_not_found')) }
  // Con un error de campo no se gasta el intento de "Voy": el jugador sigue en la tarjeta.
  let pending: Failure | null = null
  try {
    pending = await completeWelcomeToJoin(g.playerId, formData, 'sumarse')
    if (!pending) await joinByInvite(g.playerId, code.data)
  } catch (err) {
    return failure(err)
  } finally {
    if (!pending) await afterJoin()
  }
  return pending ?? { success: true }
}

/** "Me bajo" (§5.4): hasta `starts_at`; si había banco, entra el primero (lo resuelve la base). */
export async function leaveMatchAction(matchId: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const id = uuid.safeParse(matchId)
  if (!id.success)
    return { success: false, error: rivalErrorMessage(new RivalError('rival_not_found')) }
  try {
    await leaveMatch(g.playerId, id.data)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

/**
 * Arma el partido y va a la vista del organizador. `mode` (`full` | `rival`, lo que eligió en
 * "¿Qué armás?") es solo una pista de presentación para `?creado=`: no es una regla ni se valida.
 */
export async function createMatchAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalCreate')
  if ('error' in g) return g

  let inviteCode: string
  try {
    // Las reservas se leen ACÁ, del jugador de la sesión: el form no manda `bookingId`.
    const bookings = await listUpcomingConfirmedBookings(g.playerId)
    const parsed = parseNewMatchForm(Object.fromEntries(formData), bookings)
    if (!parsed.ok) return invalid(parsed)
    ;({ inviteCode } = await createMatch(g.playerId, parsed.draft))
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival/mis-partidos')
  redirect(`/rival/p/${inviteCode}?creado=${formData.get('mode') === 'rival' ? 'rival' : '1'}`)
}

/** Cancela un partido propio (el service filtra por organizador). La vista se refresca sola. */
export async function cancelMatchAction(matchId: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const id = uuid.safeParse(matchId)
  if (!id.success)
    return { success: false, error: rivalErrorMessage(new RivalError('rival_not_found')) }
  try {
    await cancelMatch(g.playerId, id.data)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

const notFound = (): { success: false; error: string } => ({
  success: false,
  error: rivalErrorMessage(new RivalError('rival_not_found')),
})

/** Pedido del tablón: el complejo sale de la tarjeta publicada, no del cliente. */
async function requestFromBoard(playerId: string, matchId: string): Promise<void> {
  const card = await getBoardMatch(matchId)
  if (!card) throw new RivalError('rival_not_found')
  try {
    await requestToJoin(playerId, { matchId, tenantId: card.tenantId })
  } catch (err) {
    // Respuesta perdida y reintento: si el pedido ya entró (o ya está adentro), eso es el éxito.
    // Un pedido rechazado o alguien que se bajó sigue siendo un error.
    if (err instanceof RivalError && err.code === 'rival_already_participant') {
      const mine = await getMyMatch(playerId, matchId)
      if (mine?.myStatus && ['requested', 'confirmed', 'bench'].includes(mine.myStatus)) return
    }
    throw err
  }
}

/** "Quiero sumarme" desde el tablón (§5.6), con la bienvenida ya aceptada. El organizador decide. */
export async function requestToJoinAction(matchId: string): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const id = uuid.safeParse(matchId)
  if (!id.success) return notFound()
  try {
    await requestFromBoard(g.playerId, id.data)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

/** Lo que falte de la bienvenida + pedido del tablón en un toque. El `matchId` viaja oculto en el form. */
export async function acceptWelcomeAndRequestAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g

  const id = uuid.safeParse(formData.get('matchId'))
  if (!id.success) return notFound()
  let pending: Failure | null = null
  try {
    // El propósito sale del partido leído acá, no de un campo del form (decisión 15).
    const card = await getBoardMatch(id.data)
    if (!card) return notFound()
    pending = await completeWelcomeToJoin(
      g.playerId,
      formData,
      card.seeking === 'rival' ? 'desafiar' : 'sumarse',
    )
    if (!pending) await requestFromBoard(g.playerId, id.data)
  } catch (err) {
    return failure(err)
  } finally {
    revalidatePath('/rival', 'layout')
  }
  return pending ?? { success: true }
}

/** El organizador acepta o rechaza un pedido. El service filtra por organizador. */
export async function decideRequestAction(
  participantId: string,
  decision: 'accept' | 'decline',
): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const id = uuid.safeParse(participantId)
  if (!id.success || (decision !== 'accept' && decision !== 'decline')) return notFound()
  try {
    await decideRequest(g.playerId, id.data, decision)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

/** El organizador saca a alguien confirmado o del banco; entra el primero del banco. */
export async function removeParticipantAction(participantId: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const id = uuid.safeParse(participantId)
  if (!id.success) return notFound()
  try {
    await removeParticipant(g.playerId, id.data)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

/** Publica (o cambia lo que busca) un partido propio. WhatsApp, consentimiento y `savePhone` viajan en el form. */
export async function publishToBoardAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g

  const id = uuid.safeParse(formData.get('matchId'))
  if (!id.success) return notFound()
  const parsed = parseBoardForm(Object.fromEntries(formData))
  if (!parsed.ok) return invalid(parsed)
  try {
    await publishToBoard(g.playerId, id.data, parsed.board)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

/** Saca el partido del tablón (queda solo el grupo). */
export async function unpublishFromBoardAction(matchId: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const id = uuid.safeParse(matchId)
  if (!id.success) return notFound()
  try {
    await unpublishFromBoard(g.playerId, id.data)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

/** Denuncia con motivo cerrado. Una por denunciante, partido y denunciado (la base lo exige). */
async function report(input: {
  matchId: string
  reason: RivalReportReason
  reportedPlayerId?: string
}): Promise<ActionResult> {
  const g = await guard('rivalReport')
  if ('error' in g) return g
  const parsed = rivalReportSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: rivalErrorMessage(new RivalError('rival_invalid_report')) }
  }
  const { matchId, reason, reportedPlayerId } = parsed.data
  try {
    if (reportedPlayerId) await reportPlayer(g.playerId, matchId, reportedPlayerId, reason)
    else await reportMatch(g.playerId, matchId, reason)
  } catch (err) {
    // Respuesta perdida y reintento: la denuncia ya entró, que es lo que el jugador quería.
    if (!(err instanceof RivalError && err.code === 'rival_already_reported')) return failure(err)
  }
  revalidatePath('/rival', 'layout')
  return { success: true }
}

export async function reportMatchAction(
  matchId: string,
  reason: RivalReportReason,
): Promise<ActionResult> {
  return report({ matchId, reason })
}

export async function reportPlayerAction(
  matchId: string,
  reportedPlayerId: string,
  reason: RivalReportReason,
): Promise<ActionResult> {
  return report({ matchId, reason, reportedPlayerId })
}

/** "Avisame cuando haya" (estado vacío del tablón): el complejo viaja en el form y se valida acá. */
export async function subscribeRivalAlertAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const tenantId = uuid.safeParse(formData.get('tenantId'))
  if (!tenantId.success) {
    return { success: false, error: 'Elegí un complejo.', field: 'tenantId' }
  }
  try {
    await subscribeAlert(g.playerId, {
      tenantId: tenantId.data,
      onlyGoalkeeper: formData.get('onlyGoalkeeper') === 'on',
    })
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival/tablon')
  return { success: true }
}

/** "Dejar de avisarme" desde la sesión: el complejo viaja en el form. Idempotente. */
export async function unsubscribeMyRivalAlertAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return g
  const tenantId = uuid.safeParse(formData.get('tenantId'))
  if (!tenantId.success) {
    return { success: false, error: 'Elegí un complejo.', field: 'tenantId' }
  }
  try {
    await unsubscribeAlert(g.playerId, tenantId.data)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival/tablon')
  return { success: true }
}

/**
 * Baja de las alertas desde el link del mail (`/rival/baja?t=`). Es POST a propósito: los
 * escáneres de mail abren links y un GET jamás borra. Sin sesión: el token firmado es la prueba.
 * Token inválido o suscripción ya inexistente dan la misma pantalla (no revela si existía).
 */
export async function unsubscribeRivalAlertAction(formData: FormData): Promise<void> {
  if (!(await isRivalEnabled())) notFoundPage()
  const token = formData.get('t')
  if (typeof token === 'string' && token.length > 0 && token.length <= 512) {
    try {
      await unsubscribeByToken(token)
    } catch (err) {
      // La pantalla es la misma haya fallado o no; la falla de infraestructura va a Sentry.
      captureException(err)
    }
  }
  redirect('/rival/baja?listo=1')
}
