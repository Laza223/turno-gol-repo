import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { withTenantContext } from '@/shared/db/client'
import { pushSubscriptions } from '@/shared/db/schema'
import { badRequest, forbidden, validationError } from '@/shared/api-error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const subscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL').max(2000, 'endpoint too long'),
  keys: z.object({
    p256dh: z.string().min(80, 'p256dh must be at least 80 chars').max(200),
    auth: z.string().min(16, 'auth must be at least 16 chars').max(200),
  }),
  userAgent: z.string().max(500).optional(),
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

  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const { endpoint, keys, userAgent } = parsed.data
  if (!user.staffUserId) {
    return forbidden('Acceso denegado.', { code: 'NO_STAFF_USER_ID' })
  }
  const tenantId = user.tenantId!
  const staffUserId = user.staffUserId

  // push_subscriptions es tenant-scoped y tiene policy de escritura
  // (push_subs_modify, 014_push_subscriptions.sql) — pero esa policy exige
  // app.current_tenant_id seteado. El getSql() plano usado antes acá no lo
  // seteaba, así que bajo FORCE RLS (036) + el rol restringido (turnogol_app,
  // PR #30) el INSERT violaba RLS (WITH CHECK contra un current_setting vacío).
  // withTenantContext resuelve esto seteando el contexto en la misma transacción.
  const [row] = await withTenantContext(tenantId, (tx) =>
    tx
      .insert(pushSubscriptions)
      .values({
        tenantId,
        staffUserId,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        userAgent: userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          tenantId,
          staffUserId,
          p256dhKey: keys.p256dh,
          authKey: keys.auth,
          userAgent: userAgent ?? null,
          lastUsedAt: sql`now()`,
        },
      })
      .returning({ id: pushSubscriptions.id }),
  )

  return NextResponse.json({ success: true, subscriptionId: row!.id })
})
