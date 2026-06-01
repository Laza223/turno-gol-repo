import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { downgradeSchema } from '@/modules/billing/billing.schema'
import { downgrade } from '@/modules/billing/billing.service'
import {
  DowngradeBlockedError,
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'

export const dynamic = 'force-dynamic'

export const POST = withTenant(async (req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = downgradeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } },
      { status: 422 },
    )
  }
  try {
    const result = await downgrade(user.tenantId!, parsed.data.targetPlanId, tx)
    return NextResponse.json({ data: result }, { status: 200 })
  } catch (err) {
    if (err instanceof DowngradeBlockedError) {
      return NextResponse.json(
        {
          error: {
            code: 'DOWNGRADE_BLOCKED',
            message: err.message,
            details: {
              currentCourtCount: err.currentCourtCount,
              targetMaxCourts: err.targetMaxCourts,
            },
          },
        },
        { status: 422 },
      )
    }
    if (err instanceof PlanNotFoundError) {
      return NextResponse.json(
        { error: { code: 'PLAN_NOT_FOUND', message: err.message } },
        { status: 404 },
      )
    }
    if (err instanceof ReactivateNotAllowedError) {
      return NextResponse.json(
        { error: { code: 'INVALID_STATE', message: err.message } },
        { status: 409 },
      )
    }
    if (err instanceof SubscriptionNotFoundError) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: err.message } },
        { status: 404 },
      )
    }
    throw err
  }
})
