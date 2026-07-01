import { enforce, rateLimit429 } from '@/shared/rate-limit'
import { resolveSystemAdmin } from '@/modules/auth/system-admin.guards'
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
  // Triple chequeo (claim JWT + fila activa en system_admins + allowlist),
  // no solo el claim JWT: un super-admin revocado con sesión viva no debe
  // seguir viendo esto (audit_report.md Capa 5, C5-G3).
  const auth = await resolveSystemAdmin()
  if (!auth) {
    return forbidden('Solo el super admin puede acceder a este recurso.')
  }
  // adminCrud bucket keyed by the super-admin id (no tenant context here).
  const rl = await enforce('adminCrud', auth.user.systemAdminId)
  if (!rl.ok) return rateLimit429(rl)

  const queues = await getQueueDepths()
  return Response.json({ queues, timestamp: new Date().toISOString() })
}
