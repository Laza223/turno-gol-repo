import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { getSql } from '@/shared/db/client'

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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = unsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { endpoint } = parsed.data
  if (!user.staffUserId) {
    return NextResponse.json(
      { error: 'forbidden', code: 'NO_STAFF_USER_ID' },
      { status: 403 },
    )
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
