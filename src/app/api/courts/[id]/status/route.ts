import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { parseRouteUuid } from '@/shared/api/route-params'
import { toggleStatus } from '@/modules/courts/court.service'

export const dynamic = 'force-dynamic'

const toggleStatusSchema = z.object({
  status: z.enum(['online', 'offline']),
})

export const PATCH = withTenant(async (req, _user, tx) => {
  const idResult = parseRouteUuid(req, 'second-last')
  if ('response' in idResult) return idResult.response
  const courtId = idResult.uuid

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = toggleStatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'status debe ser "online" o "offline"' },
      { status: 422 },
    )
  }

  const court = await toggleStatus(courtId, parsed.data.status, tx)
  if (!court) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(court)
})
