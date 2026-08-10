import { NextResponse } from 'next/server'
import { forbidden } from '@/shared/api-error'
import { withTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { notifyStaffPush } from '@/modules/notifications/push.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/push/test
 *
 * Dispatches a test push notification to all subscriptions belonging to the
 * currently authenticated admin (scoped by tenant_id + staff_user_id from JWT).
 * No request body needed — identity comes from session.
 *
 * Returns: { success: true, dispatched: number }
 */
export const POST = withTenant(async (_req, user) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  if (!user.staffUserId) {
    return forbidden('Acceso denegado.', { code: 'NO_STAFF_USER_ID' })
  }
  const tenantId = user.tenantId!
  const staffUserId = user.staffUserId

  const { enqueued } = await notifyStaffPush(tenantId, staffUserId, {
    type: 'test',
    courtName: 'Test',
    dateLabel: 'ahora',
    timeLabel: 'mismo',
    // Sin el prefijo `/admin`: es un route group, no un segmento de URL.
    url: '/grilla',
  })

  return NextResponse.json({ success: true, dispatched: enqueued })
})
