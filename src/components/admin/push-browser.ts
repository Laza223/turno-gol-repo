import type { ActionResult } from '@/shared/types/action-result'
import { fetchWithTimeout } from '@/shared/utils/async'

type DeviceSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

export type PushDeviceActions = {
  subscribe: (subscription: DeviceSubscription) => Promise<ActionResult<{ subscriptionId: string }>>
  unsubscribe: (endpoint: string) => Promise<ActionResult>
  test: (subscriptionId: string) => Promise<ActionResult<{ notificationId?: string }>>
  status: (
    subscriptionId: string,
    notificationId?: string,
  ) => Promise<
    ActionResult<{
      acceptedAt: string | null
      processedAt: string | null
      openedAt: string | null
    }>
  >
}

export const PUSH_IDENTITY_KEY = 'turnogol:push-identity'

export async function syncPushSubscription(sub: PushSubscription, actions?: PushDeviceActions) {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null
  const input: DeviceSubscription = {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  }
  if (actions) {
    const result = await actions.subscribe(input)
    if (!result.success && 'code' in result && result.code === 'OWNERSHIP') await sub.unsubscribe()
    return result.success ? result.subscriptionId : null
  }
  const response = await fetchWithTimeout('/api/admin/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 403) {
    await sub.unsubscribe()
    return null
  }
  if (!response.ok) return null
  const result = (await response.json()) as { subscriptionId?: unknown }
  return typeof result.subscriptionId === 'string' ? result.subscriptionId : null
}

/** Se revoca localmente aunque falle la red: el celular no conserva avisos de otra cuenta. */
export async function disableCurrentPush(actions?: PushDeviceActions): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const notifications = await registration?.getNotifications?.().catch(() => [])
  notifications?.forEach((notification) => notification.close())
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  try {
    if (actions) await actions.unsubscribe(subscription.endpoint)
    else {
      await fetchWithTimeout('/api/admin/push/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
    }
  } finally {
    await subscription.unsubscribe()
    try {
      localStorage.removeItem(PUSH_IDENTITY_KEY)
    } catch {
      /* Storage bloqueado. */
    }
  }
}
