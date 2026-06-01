import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { upgradeSchema } from '@/modules/billing/billing.schema'
import { upgrade } from '@/modules/billing/billing.service'
import {
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import { getBillingGateway } from '@/modules/billing/billing.gateway'

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
  const parsed = upgradeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } },
      { status: 422 },
    )
  }
  try {
    const result = await upgrade(
      user.tenantId!,
      parsed.data.targetPlanId,
      getBillingGateway(),
      tx,
    )
    return NextResponse.json({ data: result }, { status: 200 })
  } catch (err) {
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
