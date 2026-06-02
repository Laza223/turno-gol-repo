import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { badRequest, conflict, notFound, validationError } from '@/shared/api-error'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { cancelSchema } from '@/modules/billing/billing.schema'
import { cancel } from '@/modules/billing/billing.service'
import {
  InvalidTransitionError,
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
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }
  try {
    const result = await cancel(
      user.tenantId!,
      parsed.data.reason,
      getBillingGateway(),
      tx,
    )
    return NextResponse.json({ data: result }, { status: 200 })
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return conflict(err.message, { code: 'INVALID_STATE' })
    }
    if (err instanceof SubscriptionNotFoundError) {
      return notFound(err.message)
    }
    throw err
  }
})
