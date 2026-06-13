import { enforce, rateLimit429 } from '@/shared/rate-limit'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getQueueDepths } from '@/shared/jobs/queue-stats'
import { forbidden } from '@/shared/api-error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Queue-depth snapshot for monitoring/dashboards (B10 T7). Super-admin only.
 * Reports each active queue's pending size; a per-queue failure degrades that
 * entry to `depth: null` instead of failing the whole response. The snapshot
 * logic lives in `@/shared/jobs/queue-stats` (shared with the super-admin
 * dashboard).
 */
export async function GET(): Promise<Response> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'system_admin') {
    return forbidden('Solo el super admin puede acceder a este recurso.')
  }
  // adminCrud bucket keyed by the super-admin id (no tenant context here).
  const rl = await enforce('adminCrud', user.systemAdminId)
  if (!rl.ok) return rateLimit429(rl)

  const queues = await getQueueDepths()
  return Response.json({ queues, timestamp: new Date().toISOString() })
}
