import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { withTenantContext } from '@/shared/db/client'
import { pushSubscriptions } from '@/shared/db/schema'
import { badRequest, forbidden, validationError } from '@/shared/api-error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const unsubscribeSchema = z.object({
  endpoint: z.url('endpoint must be a valid URL').max(2000, 'endpoint too long'),
})

export const POST = withTenant(async (req: NextRequest, user) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = unsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const { endpoint } = parsed.data
  if (!user.staffUserId) {
    return forbidden('Acceso denegado.', { code: 'NO_STAFF_USER_ID' })
  }
  const tenantId = user.tenantId!
  const staffUserId = user.staffUserId

  // Ver comentario en subscribe/route.ts: push_subscriptions exige
  // app.current_tenant_id para su policy de escritura (push_subs_modify);
  // withTenantContext lo setea, el getSql() plano usado antes no.
  const rows = await withTenantContext(tenantId, (tx) =>
    tx
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.tenantId, tenantId),
          eq(pushSubscriptions.staffUserId, staffUserId),
        ),
      )
      .returning({ id: pushSubscriptions.id }),
  )

  return NextResponse.json({ success: true, deleted: rows.length > 0 })
})
