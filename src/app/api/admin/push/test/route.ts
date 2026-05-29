import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
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
  const tenantId = user.tenantId!
  const staffUserId = user.staffUserId!

  const { enqueued } = await notifyStaffPush(tenantId, staffUserId, {
    type: 'test',
    courtName: 'Test',
    dateLabel: 'ahora',
    timeLabel: 'mismo',
    url: '/admin/grilla',
  })

  return NextResponse.json({ success: true, dispatched: enqueued })
})
