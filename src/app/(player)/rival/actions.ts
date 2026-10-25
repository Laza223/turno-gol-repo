'use server'

import { revalidatePath } from 'next/cache'
import { notFound as notFoundPage, redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { RivalError } from '@/modules/rival/rival.errors'
import {
  inviteCodeSchema,
  rivalReportSchema,
  rivalWelcomeSchema,
  type RivalReportReason,
} from '@/modules/rival/rival.schema'
import { parseBoardForm, parseNewMatchForm } from '@/modules/rival/rival-form'
import {
  subscribeAlert,
  unsubscribeAlert,
  unsubscribeByToken,
} from '@/modules/rival/rival-alerts.service'
import { rivalErrorMessage } from '@/modules/rival/rival-copy'
import {
  acceptRivalWelcome,
  cancelMatch,
  createMatch,
  decideRequest,
  getBoardMatch,
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

/** Resultado de un form de RIVAL: `field` dice junto a qué campo se pinta el error. */
export type RivalFormResult = { success: true } | { success: false; error: string; field?: string }

const RATE_LIMITED = 'Demasiadas solicitudes. Esperá un momento.'

/**
 * Orden de toda action de RIVAL: flag → sesión de jugador → rate limit. Sin flag es como si
 * la acción no existiera. Devuelve el `playerId` o el resultado de error ya armado.
 */
async function guard(policy: PolicyName): Promise<{ playerId: string } | { error: string }> {
  if (!(await isRivalEnabled())) return { error: 'RIVAL todavía no está disponible.' }
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') return { error: 'Ingresá a tu cuenta para seguir.' }
  const rl = await enforce(policy, user.playerId)
  if (!rl.ok) return { error: RATE_LIMITED }
  return { playerId: user.playerId }
}

/** Error de service → texto. Lo que no es de RIVAL (infraestructura) va a Sentry y sale genérico. */
function failure(err: unknown): { success: false; error: string } {
  if (!(err instanceof RivalError)) captureException(err)
  return { success: false, error: rivalErrorMessage(err) }
}

type WelcomeParse =
  | { ok: true; data: Parameters<typeof acceptRivalWelcome>[1] }
  | { ok: false; result: RivalFormResult }

function parseWelcome(formData: FormData): WelcomeParse {
  const parsed = rivalWelcomeSchema.safeParse({
    firstName: formData.get('firstName'),
    position: formData.get('position'),
    zone: formData.get('zone'),
  })
  if (parsed.success) return { ok: true, data: parsed.data }
  const issue = parsed.error.issues[0]
  const field = issue?.path[0]
  return {
    ok: false,
    result: {
      success: false,
      error: issue?.message ?? 'Revisá tus datos.',
      ...(typeof field === 'string' ? { field } : {}),
    },
  }
}

/** Bienvenida (§7): nombre, posición y zona + el clickwrap, en un toque. */
export async function acceptRivalWelcomeAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }

  const welcome = parseWelcome(formData)
  if (!welcome.ok) return welcome.result
  try {
    await acceptRivalWelcome(g.playerId, welcome.data)
  } catch (err) {
    return failure(err)
  }
  // La page vuelve a leer la bienvenida y muestra el formulario.
  revalidatePath('/rival/nuevo')
  return { success: true }
}

/** Gasta el intento de "Voy" (cookie de Google) y refresca la vista del partido y Mis partidos. */
async function afterJoin(): Promise<void> {
  await clearRivalIntentCookie()
  revalidatePath('/rival', 'layout')
}

/** "Voy" con la bienvenida ya aceptada (§5.2). Idempotente: tocarlo estando adentro no cambia nada. */
export async function joinMatchAction(code: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }
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

/** "Estoy adentro" (§5.2): acepta la bienvenida y suma en un solo toque. El código viaja en el form. */
export async function acceptWelcomeAndJoinAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }

  const welcome = parseWelcome(formData)
  if (!welcome.ok) return welcome.result
  const code = inviteCodeSchema.safeParse(formData.get('code'))
  if (!code.success)
    return { success: false, error: rivalErrorMessage(new RivalError('rival_not_found')) }
  try {
    await acceptRivalWelcome(g.playerId, welcome.data)
    await joinByInvite(g.playerId, code.data)
  } catch (err) {
    return failure(err)
  } finally {
    await afterJoin()
  }
  return { success: true }
}

/** "Me bajo" (§5.4): hasta `starts_at`; si había banco, entra el primero (lo resuelve la base). */
export async function leaveMatchAction(matchId: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }
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

/** Arma el partido (con o sin tablón, según `seeking`) y va a la vista del organizador. */
export async function createMatchAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalCreate')
  if ('error' in g) return { success: false, error: g.error }

  let inviteCode: string
  try {
    // Las reservas se leen ACÁ, del jugador de la sesión: el form no manda `bookingId`.
    const bookings = await listUpcomingConfirmedBookings(g.playerId)
    const parsed = parseNewMatchForm(Object.fromEntries(formData), bookings)
    if (!parsed.ok) {
      return {
        success: false,
        error: parsed.error,
        ...(parsed.field ? { field: parsed.field } : {}),
      }
    }
    ;({ inviteCode } = await createMatch(g.playerId, parsed.draft))
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival/mis-partidos')
  redirect(`/rival/p/${inviteCode}?creado=1`)
}

/** Cancela un partido propio (el service filtra por organizador). La vista se refresca sola. */
export async function cancelMatchAction(matchId: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }
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
  await requestToJoin(playerId, { matchId, tenantId: card.tenantId })
}

/** "Quiero sumarme" desde el tablón (§5.6), con la bienvenida ya aceptada. El organizador decide. */
export async function requestToJoinAction(matchId: string): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }
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

/** Bienvenida + pedido del tablón en un toque. El `matchId` viaja oculto en el form. */
export async function acceptWelcomeAndRequestAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }

  const welcome = parseWelcome(formData)
  if (!welcome.ok) return welcome.result
  const id = uuid.safeParse(formData.get('matchId'))
  if (!id.success) return notFound()
  try {
    await acceptRivalWelcome(g.playerId, welcome.data)
    await requestFromBoard(g.playerId, id.data)
  } catch (err) {
    return failure(err)
  } finally {
    revalidatePath('/rival', 'layout')
  }
  return { success: true }
}

/** El organizador acepta o rechaza un pedido. El service filtra por organizador. */
export async function decideRequestAction(
  participantId: string,
  decision: 'accept' | 'decline',
): Promise<ActionResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }
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
  if ('error' in g) return { success: false, error: g.error }
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

/** Publica (o cambia lo que busca) un partido propio. WhatsApp y consentimiento viajan en el form. */
export async function publishToBoardAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }

  const id = uuid.safeParse(formData.get('matchId'))
  if (!id.success) return notFound()
  const parsed = parseBoardForm(Object.fromEntries(formData))
  if (!parsed.ok) {
    return {
      success: false,
      error: parsed.error,
      ...(parsed.field ? { field: parsed.field } : {}),
    }
  }
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
  if ('error' in g) return { success: false, error: g.error }
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
  if ('error' in g) return { success: false, error: g.error }
  const parsed = rivalReportSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: rivalErrorMessage(new RivalError('rival_invalid_report')) }
  }
  const { matchId, reason, reportedPlayerId } = parsed.data
  try {
    if (reportedPlayerId) await reportPlayer(g.playerId, matchId, reportedPlayerId, reason)
    else await reportMatch(g.playerId, matchId, reason)
  } catch (err) {
    return failure(err)
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
  if ('error' in g) return { success: false, error: g.error }
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
  revalidatePath('/rival')
  return { success: true }
}

/** "Dejar de avisarme" desde la sesión: el complejo viaja en el form. Idempotente. */
export async function unsubscribeMyRivalAlertAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }
  const tenantId = uuid.safeParse(formData.get('tenantId'))
  if (!tenantId.success) {
    return { success: false, error: 'Elegí un complejo.', field: 'tenantId' }
  }
  try {
    await unsubscribeAlert(g.playerId, tenantId.data)
  } catch (err) {
    return failure(err)
  }
  revalidatePath('/rival')
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
