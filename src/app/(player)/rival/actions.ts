'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { RivalError } from '@/modules/rival/rival.errors'
import { rivalWelcomeSchema } from '@/modules/rival/rival.schema'
import { parseNewMatchForm } from '@/modules/rival/rival-form'
import { rivalErrorMessage } from '@/modules/rival/rival-copy'
import {
  acceptRivalWelcome,
  cancelMatch,
  createMatch,
  listUpcomingConfirmedBookings,
} from '@/modules/rival/rival.service'
import { captureException } from '@/lib/sentry'
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

/** Bienvenida (§7): nombre, posición y zona + el clickwrap, en un toque. */
export async function acceptRivalWelcomeAction(
  _prev: RivalFormResult,
  formData: FormData,
): Promise<RivalFormResult> {
  const g = await guard('rivalWrite')
  if ('error' in g) return { success: false, error: g.error }

  const parsed = rivalWelcomeSchema.safeParse({
    firstName: formData.get('firstName'),
    position: formData.get('position'),
    zone: formData.get('zone'),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0]
    return {
      success: false,
      error: issue?.message ?? 'Revisá tus datos.',
      ...(typeof field === 'string' ? { field } : {}),
    }
  }
  try {
    await acceptRivalWelcome(g.playerId, parsed.data)
  } catch (err) {
    return failure(err)
  }
  // La page vuelve a leer la bienvenida y muestra el formulario.
  revalidatePath('/rival/nuevo')
  return { success: true }
}

/** Arma el partido y va a la vista del organizador. Solo "el grupo": publicar en el tablón es del PR4. */
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
