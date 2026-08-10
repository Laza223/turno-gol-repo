import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { notFound } from '@/shared/api-error'
import { withTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { getSubscriptionState } from '@/modules/billing/billing.service'
import { SubscriptionNotFoundError } from '@/modules/billing/billing.errors'

export const dynamic = 'force-dynamic'

// Facturación: solo admin (audit_report.md 3-07/3-16).
export const GET = withTenant(async (_req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  try {
    const state = await getSubscriptionState(user.tenantId!, tx)
    return NextResponse.json({ data: state }, { status: 200 })
  } catch (err) {
    if (err instanceof SubscriptionNotFoundError) {
      return notFound(err.message)
    }
    throw err
  }
}, { roles: ['admin'] })
