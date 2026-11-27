import { NextResponse } from 'next/server'
import { badRequest, forbidden } from '@/shared/api-error'
import { z } from 'zod'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { findOwnPushSubscription } from '@/modules/notifications/push-subscription.service'
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
export const POST = withTenant(async (req, user) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled
  if (await getImpersonationSession())
    return forbidden('Probá las notificaciones desde tu propia cuenta.')

  if (!user.staffUserId) {
    return forbidden('Acceso denegado.', { code: 'NO_STAFF_USER_ID' })
  }
  const tenantId = user.tenantId!
  const staffUserId = user.staffUserId
  let subscriptionId: string | undefined
  const text = await req.text()
  if (text) {
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return badRequest('JSON inválido.')
    }
    const parsed = z.object({ subscriptionId: z.uuid() }).safeParse(body)
    if (!parsed.success) return badRequest('Dispositivo inválido.')
    subscriptionId = parsed.data.subscriptionId
    if (!(await findOwnPushSubscription(tenantId, staffUserId, subscriptionId)))
      return forbidden('Este dispositivo no pertenece a tu cuenta.')
  }

  const { enqueued, notificationId } = await notifyStaffPush(
    tenantId,
    staffUserId,
    {
      type: 'test',
      title: 'Las notificaciones de TurnoGol',
      body: 'La prueba llegó a este dispositivo. Tocá para volver a TurnoGol.',
      courtName: 'Test',
      dateLabel: 'ahora',
      timeLabel: 'mismo',
      // Sin el prefijo `/admin`: es un route group, no un segmento de URL.
      url: '/grilla',
    },
    subscriptionId,
  )

  return NextResponse.json({
    success: true,
    dispatched: enqueued,
    ...(notificationId ? { notificationId } : {}),
  })
})
