import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { parseRouteUuid } from '@/shared/api/route-params'
import { badRequest, notFound, validationError } from '@/shared/api-error'
import { getCourtById, updateCourt } from '@/modules/courts/court.service'
import { updateCourtSchema } from '@/modules/courts/court.schema'

export const dynamic = 'force-dynamic'

export const GET = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req)
  if ('response' in idResult) return idResult.response
  const courtId = idResult.uuid
  const court = await getCourtById(courtId, user.tenantId!, tx)
  if (!court) return notFound('La cancha no existe.')
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
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = updateCourtSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }

  const court = await updateCourt(courtId, user.tenantId!, parsed.data, tx)
  if (!court) return notFound('La cancha no existe.')
  return NextResponse.json(court)
})
