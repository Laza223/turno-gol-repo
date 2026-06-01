import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { getSubscriptionState } from '@/modules/billing/billing.service'
import { SubscriptionNotFoundError } from '@/modules/billing/billing.errors'

export const dynamic = 'force-dynamic'

export const GET = withTenant(async (_req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  try {
    const state = await getSubscriptionState(user.tenantId!, tx)
    return NextResponse.json({ data: state }, { status: 200 })
  } catch (err) {
    if (err instanceof SubscriptionNotFoundError) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: err.message } },
        { status: 404 },
      )
    }
    throw err
  }
})
