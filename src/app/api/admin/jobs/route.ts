import { getBoss } from '@/shared/jobs/boss'
import { enforce, rateLimit429 } from '@/shared/rate-limit'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { ALL_QUEUES } from '@/shared/jobs/dlq'
import { forbidden } from '@/shared/api-error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Queue-depth snapshot for monitoring/dashboards (B10 T7). Super-admin only.
 * Reports each active queue's pending size; a per-queue failure degrades that
 * entry to `depth: null` instead of failing the whole response.
 */
export async function GET(): Promise<Response> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'system_admin') {
    return forbidden('Solo el super admin puede acceder a este recurso.')
  }
  // adminCrud bucket keyed by the super-admin id (no tenant context here).
  const rl = await enforce('adminCrud', user.systemAdminId)
  if (!rl.ok) return rateLimit429(rl)

  const boss = await getBoss()
  const queues = await Promise.all(
    ALL_QUEUES.map(async (queue) => {
      try {
        return { queue, depth: await boss.getQueueSize(queue) }
      } catch {
        return { queue, depth: null, error: 'unavailable' }
      }
    }),
  )
  return Response.json({ queues, timestamp: new Date().toISOString() })
}
