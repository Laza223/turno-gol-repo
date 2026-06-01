import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { withRole } from '@/shared/middleware/with-role'
import { getTenantMetrics } from '@/modules/metrics/metrics.service'

export const dynamic = 'force-dynamic'

/**
 * Business metrics for the calling admin's complex (last 30 days): reservations
 * per day, no-show rate, and income from cash flows. JSON only — no dashboard UI.
 *
 * NOTE: the spec asked for withRole('owner'), but v1 has a single staff role
 * ('admin'); there is no 'owner' (CLAUDE.md: "un solo rol admin con PIN").
 * withRole('admin') is the strictest gate available. withTenant already scopes
 * the tx to the tenant via RLS, so the metrics are inherently per-tenant.
 */
export const GET = withTenant(
  withRole('admin', async (_req: NextRequest, user, tx) => {
    const metrics = await getTenantMetrics(user.tenantId!, tx)
    return NextResponse.json({ data: metrics })
  }),
)
