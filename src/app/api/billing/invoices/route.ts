import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { listInvoices } from '@/modules/billing/billing.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'

export const dynamic = 'force-dynamic'

// Facturación: solo admin (doc15 §5.8), mismo patrón que /api/billing/subscription.
// No usa la `tx` que `withTenant` abre: listInvoices lee en vivo de MP, no de la DB.
export const GET = withTenant(
  async (_req: NextRequest, user) => {
    const throttled = await guard('adminCrud', user.tenantId!)
    if (throttled) return throttled

    const invoices = await listInvoices(user.tenantId!, getBillingGateway())
    return NextResponse.json({ data: invoices }, { status: 200 })
  },
  { roles: ['admin'] },
)
