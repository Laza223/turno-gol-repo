import { headers } from 'next/headers'
import { enforce, rateLimit429 } from '@/shared/rate-limit'
import { parseClientIp } from '@/shared/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/push/vapid
 *
 * Returns the NEXT_PUBLIC_VAPID_PUBLIC_KEY for the client ServiceWorker to use
 * when calling PushManager.subscribe(). The public key is intentionally public,
 * so no auth is required. Rate-limited per IP (5 req/min) if Upstash configured;
 * passes through when Upstash is not available (failMode: 'open').
 */
export async function GET(): Promise<Response> {
  const ip = parseClientIp(headers())
  const outcome = await enforce('vapidPublic', ip)
  if (!outcome.ok) return rateLimit429(outcome)

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    return Response.json({ error: 'vapid_not_configured' }, { status: 500 })
  }

  return Response.json({ publicKey })
}
