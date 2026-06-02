import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { parseRouteUuid } from '@/shared/api/route-params'
import { badRequest, notFound, validationError } from '@/shared/api-error'
import { toggleStatus } from '@/modules/courts/court.service'

export const dynamic = 'force-dynamic'

const toggleStatusSchema = z.object({
  status: z.enum(['online', 'offline']),
})

export const PATCH = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req, 'second-last')
  if ('response' in idResult) return idResult.response
  const courtId = idResult.uuid

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = toggleStatusSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422, message: 'status debe ser "online" o "offline"' })
  }

  const court = await toggleStatus(courtId, parsed.data.status, tx)
  if (!court) return notFound('La cancha no existe.')
  return NextResponse.json(court)
})
