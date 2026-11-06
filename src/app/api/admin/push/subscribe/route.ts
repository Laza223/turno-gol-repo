import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, forbidden, validationError } from '@/shared/api-error'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { savePushSubscription } from '@/modules/notifications/push-subscription.service'
import { pushSubscriptionSchema } from '@/modules/notifications/push-subscription.schema'
import { isInsufficientPrivilege } from '@/shared/db/pg-errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Compatibilidad con PWAs ya instaladas. La nueva pantalla usa Server Actions.
export const POST = withTenant(async (req: NextRequest, user) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled
  if (!user.staffUserId || (await getImpersonationSession()))
    return forbidden('Activá las notificaciones desde tu propia cuenta.')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }
  const parsed = pushSubscriptionSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  let subscriptionId: string | null
  try {
    subscriptionId = await savePushSubscription(user.tenantId!, user.staffUserId, parsed.data)
  } catch (error) {
    if (isInsufficientPrivilege(error))
      return forbidden('La suscripción pertenece a otra sesión. Volvé a habilitarla.')
    throw error
  }
  if (!subscriptionId)
    return forbidden('La suscripción pertenece a otra sesión. Desactivala y volvé a habilitarla.')
  return NextResponse.json({ success: true, subscriptionId })
})
