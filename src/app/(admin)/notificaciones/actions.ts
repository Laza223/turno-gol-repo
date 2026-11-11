'use server'

import { z } from 'zod'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { captureException } from '@/lib/sentry'
import {
  deletePushSubscription,
  findOwnPushSubscription,
  savePushSubscription,
} from '@/modules/notifications/push-subscription.service'
import { pushSubscriptionSchema } from '@/modules/notifications/push-subscription.schema'
import { notifyStaffPush } from '@/modules/notifications/push.service'
import { getStaffPushDeliveryStatus } from '@/modules/notifications/staff-notification.service'
import { isFeatureEnabled } from '@/shared/feature-flags'
import type { PushDeviceActions } from '@/components/admin/push-browser'
import { isInsufficientPrivilege } from '@/shared/db/pg-errors'

async function authorize() {
  const auth = await requireOperatorStaff({ allowReadOnly: true, allowFree: true })
  if (!auth.ok) return auth
  if (await getImpersonationSession())
    return {
      ok: false as const,
      error: 'Las notificaciones se activan desde tu propia cuenta, fuera de la impersonación.',
    }
  if (await adminRateLimited(auth.tenant.id))
    return { ok: false as const, error: 'Esperá unos segundos antes de volver a intentar.' }
  return auth
}

export const subscribePushAction: PushDeviceActions['subscribe'] = async (input) => {
  const auth = await authorize()
  if (!auth.ok) return { success: false, error: auth.error }
  const parsed = pushSubscriptionSchema.safeParse(input)
  if (!parsed.success)
    return { success: false, error: 'La suscripción de este dispositivo no es válida.' }
  try {
    const subscriptionId = await savePushSubscription(
      auth.tenant.id,
      auth.user.staffUserId,
      parsed.data,
    )
    return subscriptionId
      ? { success: true, subscriptionId }
      : {
          success: false,
          error: 'La suscripción pertenece a otra sesión. Desactivala y volvé a habilitarla.',
          code: 'OWNERSHIP',
        }
  } catch (error) {
    if (isInsufficientPrivilege(error))
      return {
        success: false,
        error: 'La suscripción pertenece a otra sesión. Volvé a habilitarla.',
        code: 'OWNERSHIP',
      }
    captureException(error)
    return {
      success: false,
      error: 'No pudimos guardar la suscripción. Volvé a habilitarla en este dispositivo.',
    }
  }
}

export const unsubscribePushAction: PushDeviceActions['unsubscribe'] = async (endpoint) => {
  const auth = await authorize()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!z.url().max(2000).safeParse(endpoint).success)
    return { success: false, error: 'Dispositivo inválido.' }
  try {
    await deletePushSubscription(auth.tenant.id, auth.user.staffUserId, endpoint)
    return { success: true }
  } catch (error) {
    captureException(error)
    return { success: false, error: 'No pudimos desactivar el dispositivo en el servidor.' }
  }
}

export const testPushAction: PushDeviceActions['test'] = async (subscriptionId) => {
  const auth = await authorize()
  if (!auth.ok) return { success: false, error: auth.error }
  if (
    !z.uuid().safeParse(subscriptionId).success ||
    !(await findOwnPushSubscription(auth.tenant.id, auth.user.staffUserId, subscriptionId))
  )
    return { success: false, error: 'Este dispositivo no está registrado en tu cuenta.' }
  const { enqueued, notificationId } = await notifyStaffPush(
    auth.tenant.id,
    auth.user.staffUserId,
    {
      type: 'test',
      title: 'Las notificaciones de TurnoGol',
      body: 'La prueba llegó a este dispositivo. Tocá para volver a TurnoGol.',
      url: '/notificaciones',
    },
    subscriptionId,
  )
  return enqueued > 0
    ? { success: true, ...(notificationId ? { notificationId } : {}) }
    : {
        success: false,
        error: 'No se pudo encolar la prueba. Volvé a habilitar las notificaciones.',
      }
}

export const pushStatusAction: PushDeviceActions['status'] = async (
  subscriptionId,
  notificationId,
) => {
  const auth = await authorize()
  if (!auth.ok) return { success: false, error: auth.error }
  if (
    !z.uuid().safeParse(subscriptionId).success ||
    !(await findOwnPushSubscription(auth.tenant.id, auth.user.staffUserId, subscriptionId))
  )
    return { success: false, error: 'Este dispositivo ya no está registrado en tu cuenta.' }
  if (notificationId && !z.uuid().safeParse(notificationId).success)
    return { success: false, error: 'Prueba inválida.' }
  if (!(await isFeatureEnabled('staff_notifications_v2', auth.tenant.id)))
    return { success: true, acceptedAt: null, processedAt: null, openedAt: null }
  return {
    success: true,
    ...(await getStaffPushDeliveryStatus(
      auth.tenant.id,
      auth.user.staffUserId,
      subscriptionId,
      notificationId,
    )),
  }
}
