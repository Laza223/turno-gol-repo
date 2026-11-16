'use server'

import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import {
  deletePlayerPushSubscription,
  savePlayerPushSubscription,
} from '@/modules/notifications/player-push-subscription.service'
import { pushSubscriptionSchema } from '@/modules/notifications/push-subscription.schema'
import { enforce } from '@/shared/rate-limit'
import { isInsufficientPrivilege } from '@/shared/db/pg-errors'
import { captureException } from '@/lib/sentry'
import type { PushSubscriptionActions } from '@/components/admin/push-browser'

/**
 * Alta y baja del push del jugador (migr. 113, decisión 2026-11-16). Viven en el
 * grupo `(player)` pero las usan también los layouts públicos (`PortalShell`):
 * el aviso aparece donde esté el jugador logueado.
 */
async function authorizePlayer() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player')
    return { ok: false as const, error: 'Ingresá a tu cuenta para activar los avisos.' }
  const rl = await enforce('playerPush', user.playerId)
  if (!rl.ok)
    return { ok: false as const, error: 'Esperá unos segundos antes de volver a intentar.' }
  return { ok: true as const, playerId: user.playerId }
}

export const subscribePlayerPushAction: PushSubscriptionActions['subscribe'] = async (input) => {
  const auth = await authorizePlayer()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = pushSubscriptionSchema.safeParse(input)
  if (!parsed.success)
    return { success: false, error: 'La suscripción de este dispositivo no es válida.' }
  try {
    const subscriptionId = await savePlayerPushSubscription(auth.playerId, parsed.data)
    return subscriptionId
      ? { success: true, subscriptionId }
      : {
          success: false,
          error: 'Este dispositivo tiene los avisos de otra cuenta. Volvé a activarlos.',
          code: 'OWNERSHIP',
        }
  } catch (error) {
    if (isInsufficientPrivilege(error))
      return {
        success: false,
        error: 'Este dispositivo tiene los avisos de otra cuenta. Volvé a activarlos.',
        code: 'OWNERSHIP',
      }
    captureException(error)
    return { success: false, error: 'No pudimos guardar los avisos de este dispositivo.' }
  }
}

export const unsubscribePlayerPushAction: PushSubscriptionActions['unsubscribe'] = async (
  endpoint,
) => {
  const auth = await authorizePlayer()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!z.url().max(2000).safeParse(endpoint).success)
    return { success: false, error: 'Dispositivo inválido.' }
  try {
    await deletePlayerPushSubscription(auth.playerId, endpoint)
    return { success: true }
  } catch (error) {
    captureException(error)
    return { success: false, error: 'No pudimos desactivar los avisos de este dispositivo.' }
  }
}
