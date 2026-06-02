import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, forbidden, validationError } from '@/shared/api-error'
import {
  listCourts,
  createCourt,
  getCourtCountAndLimit,
  nextPlanSlug,
} from '@/modules/courts/court.service'
import { createCourtSchema } from '@/modules/courts/court.schema'

export const dynamic = 'force-dynamic'

export const GET = withTenant(async (_req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const rows = await listCourts(tx)
  return NextResponse.json(rows)
})

export const POST = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = createCourtSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }

  const tenantId = user.tenantId!
  const { count, maxCourts, planSlug } = await getCourtCountAndLimit(tenantId, tx)
  if (maxCourts !== null && count >= maxCourts) {
    return forbidden('Alcanzaste el límite de canchas de tu plan.', {
      code: 'PLAN_LIMIT_EXCEEDED',
      details: { limit: maxCourts, current: count, upgrade_to: nextPlanSlug(planSlug) },
    })
  }

  const court = await createCourt(tenantId, parsed.data, tx)
  return NextResponse.json(court, { status: 201 })
})
