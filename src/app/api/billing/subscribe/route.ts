import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { subscribeSchema } from '@/modules/billing/billing.schema'
import { subscribe } from '@/modules/billing/billing.service'
import {
  InvalidPayerEmailError,
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { badRequest, businessRule, validationError, notFound, conflict } from '@/shared/api-error'

export const dynamic = 'force-dynamic'

// Facturación: solo admin (audit_report.md 3-07/3-16).
export const POST = withTenant(async (req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }
  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }
  try {
    const result = await subscribe(
      user.tenantId!,
      parsed.data.planId,
      parsed.data.billingCycle,
      getBillingGateway(),
      tx,
    )
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    if (err instanceof PlanNotFoundError) {
      return notFound(err.message, { code: 'PLAN_NOT_FOUND' })
    }
    if (err instanceof ReactivateNotAllowedError) {
      return conflict(err.message, { code: 'INVALID_STATE' })
    }
    if (err instanceof SubscriptionNotFoundError) {
      return notFound(err.message, { code: 'NOT_FOUND' })
    }
    if (err instanceof InvalidPayerEmailError) {
      return businessRule(err.message, { code: 'INVALID_PAYER_EMAIL' })
    }
    throw err
  }
}, { roles: ['admin'] })
