import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { parseRouteUuid } from '@/shared/api/route-params'
import { getCourtById, updateCourt } from '@/modules/courts/court.service'
import { updateCourtSchema } from '@/modules/courts/court.schema'

export const dynamic = 'force-dynamic'

export const GET = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req)
  if ('response' in idResult) return idResult.response
  const courtId = idResult.uuid
  const court = await getCourtById(courtId, tx)
  if (!court) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(court)
})

export const PATCH = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req)
  if ('response' in idResult) return idResult.response
  const courtId = idResult.uuid

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateCourtSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 422 },
    )
  }

  const court = await updateCourt(courtId, parsed.data, tx)
  if (!court) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(court)
})
