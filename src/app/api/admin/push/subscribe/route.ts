import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { getSql } from '@/shared/db/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const subscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL'),
  keys: z.object({
    p256dh: z.string().min(80, 'p256dh must be at least 80 chars'),
    auth: z.string().min(16, 'auth must be at least 16 chars'),
  }),
  userAgent: z.string().max(500).optional(),
})

export const POST = withTenant(async (req: NextRequest, user) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { endpoint, keys, userAgent } = parsed.data
  const tenantId = user.tenantId!
  const staffUserId = user.staffUserId!

  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO push_subscriptions
      (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key, user_agent)
    VALUES
      (${tenantId}, ${staffUserId}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${userAgent ?? null})
    ON CONFLICT (endpoint) DO UPDATE SET
      tenant_id     = EXCLUDED.tenant_id,
      staff_user_id = EXCLUDED.staff_user_id,
      p256dh_key    = EXCLUDED.p256dh_key,
      auth_key      = EXCLUDED.auth_key,
      user_agent    = EXCLUDED.user_agent,
      last_used_at  = now()
    RETURNING id
  `

  return NextResponse.json({ success: true, subscriptionId: rows[0]!.id })
})
