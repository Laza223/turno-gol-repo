import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { withAnyRole } from '@/server/middleware/with-role'
import { getTenantMetrics } from '@/modules/metrics/metrics.service'

export const dynamic = 'force-dynamic'

/**
 * Business metrics for the calling admin's complex (last 30 days): reservations
 * per day, no-show rate, and income from cash flows. JSON only — no dashboard UI.
 *
 * Operator-level (admin + manager): las métricas de NEGOCIO del complejo las ve
 * también el encargado, igual que grilla/caja/reportes. El panel "Estado del
 * sistema" (admin-only) va aparte por /api/admin/system-status. withTenant ya
 * scopea la tx al tenant por RLS, así que las métricas son inherentemente
 * per-tenant.
 */
export const GET = withTenant(
  withAnyRole(['admin', 'manager'], async (_req: NextRequest, user, tx) => {
    const metrics = await getTenantMetrics(user.tenantId!, tx)
    return NextResponse.json({ data: metrics })
  }),
  // Rate-limit antes de abrir la transacción: el viaje a Upstash no tiene por
  // qué retener una conexión del pool.
  { rateLimit: 'adminCrud' },
)
