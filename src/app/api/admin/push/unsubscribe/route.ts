import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { getSql } from '@/shared/db/client'
import { badRequest, forbidden, validationError } from '@/shared/api-error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const unsubscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL').max(2000, 'endpoint too long'),
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

  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    DELETE FROM push_subscriptions
    WHERE endpoint      = ${endpoint}
      AND tenant_id     = ${tenantId}
      AND staff_user_id = ${staffUserId}
    RETURNING id
  `

  return NextResponse.json({ success: true, deleted: rows.length > 0 })
})
