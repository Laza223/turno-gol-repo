/**
 * Wrapper around the `web-push` npm lib.
 * - Lazy VAPID setup (idempotent across hot reloads).
 * - 4KB payload size limit (Web Push spec).
 * - 410-gone → returns `{ success: false, gone: true }` so caller deletes the subscription.
 * - Other errors → `{ success: false, statusCode }`.
 * - Sentry tracks: `notification.push.sent` on success, `notification.push.failed` on error.
 */

import webpush from 'web-push'
import { track } from '@/shared/observability'
import { logger } from '@/shared/lib/logger'

export type PushSubscriptionLike = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type PushPayload = {
  type: string
  [key: string]: unknown
}

export type SendPushResult =
  | { success: true; statusCode: number }
  | { success: false; gone: true; statusCode: 410 }
  | { success: false; gone: false; statusCode: number; error: string }

const MAX_PAYLOAD_BYTES = 4 * 1024 // 4KB

/**
 * Allowlisted Web Push service hosts (security scan F6/F10). `endpoint` is
 * attacker-influenced — any staff member can call POST /api/admin/push/subscribe
 * directly with an arbitrary syntactically-valid URL, and the worker later
 * POSTs a VAPID-signed request to whatever host is stored there. Without this
 * allowlist that's blind SSRF from server infrastructure (e.g. an endpoint
 * pointed at a cloud metadata address). Real push subscriptions only ever
 * come from these browser vendors' push services.
 */
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome/Edge/Android
  'updates.push.services.mozilla.com', // Firefox
  'web.push.apple.com', // Safari
] as const

/** Windows push (WNS) uses per-channel subdomains: wns2-<region>.notify.windows.com. */
const ALLOWED_PUSH_HOST_SUFFIX = '.notify.windows.com'

/** True only for an https:// URL whose host is a known push-service vendor. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return (
    (ALLOWED_PUSH_HOSTS as readonly string[]).includes(host) ||
    host.endsWith(ALLOWED_PUSH_HOST_SUFFIX)
  )
}

let vapidInitialized = false

function ensureVapidInitialized(): void {
  if (vapidInitialized) return
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) {
    throw new Error('VAPID env vars not set (VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidInitialized = true
}

export async function sendPushNotification(
  subscription: PushSubscriptionLike,
  payload: PushPayload,
): Promise<SendPushResult> {
  ensureVapidInitialized()
  // Defense in depth (F10): re-check the host here too, not only at
  // subscribe time — a row already sitting in push_subscriptions from
  // before the allowlist existed, or any future writer that forgets to
  // validate, must not turn this into an SSRF primitive.
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    logger.error('push send blocked: endpoint host not allowlisted', {
      module: 'web-push',
      endpoint: subscription.endpoint,
    })
    return {
      success: false,
      gone: false,
      statusCode: 0,
      error: 'endpoint host not allowlisted',
    }
  }
  const json = JSON.stringify(payload)
  const byteLen = Buffer.byteLength(json, 'utf8')
  if (byteLen > MAX_PAYLOAD_BYTES) {
    return {
      success: false,
      gone: false,
      statusCode: 0,
      error: `payload too large: ${byteLen} bytes (max ${MAX_PAYLOAD_BYTES})`,
    }
  }
  try {
    const result = await webpush.sendNotification(subscription, json)
    const statusCode = result.statusCode ?? 200
    track.notification('notification.push.sent', {
      statusCode,
      endpoint: subscription.endpoint,
      payloadType: payload.type,
    })
    return { success: true, statusCode }
  } catch (err: unknown) {
    // web-push throws WebPushError (has statusCode + body). We duck-type so the
    // unit tests can reject with plain {statusCode, body} objects from vi.mock
    // without instantiating the real class.
    const e = (err ?? {}) as { statusCode?: unknown; body?: unknown; message?: unknown }
    const statusCode = typeof e.statusCode === 'number' ? e.statusCode : 0
    const errorMessage =
      (typeof e.body === 'string' && e.body) ||
      (typeof e.message === 'string' && e.message) ||
      'unknown'
    if (statusCode === 410) {
      // Subscription expired/revoked — caller MUST delete the row.
      track.notification('notification.push.failed', {
        statusCode: 410,
        reason: 'gone',
        endpoint: subscription.endpoint,
      })
      logger.warn('push subscription gone (410)', {
        endpoint: subscription.endpoint,
        module: 'web-push',
      })
      return { success: false, gone: true, statusCode: 410 }
    }
    track.notification('notification.push.failed', {
      statusCode,
      reason: 'error',
      endpoint: subscription.endpoint,
    })
    logger.error('push send failed', { statusCode, error: errorMessage, module: 'web-push' })
    return { success: false, gone: false, statusCode, error: errorMessage }
  }
}

/** For tests: reset VAPID init state. */
export function _resetVapidForTests(): void {
  vapidInitialized = false
}
