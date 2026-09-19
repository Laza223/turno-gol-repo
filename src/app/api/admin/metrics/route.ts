import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { getTenantMetrics } from '@/modules/metrics/metrics.service'

export const dynamic = 'force-dynamic'

/**
 * Business metrics for the calling admin's complex (last 30 days): reservations
 * per day, no-show rate, and income from cash flows. JSON only — no dashboard UI.
 *
 * Solo admin (2026-09-19): las métricas del negocio son del dueño; el encargado
 * opera el día a día y ya no ve /analiticas. El panel "Estado del sistema"
 * va aparte por /api/admin/system-status. withTenant ya scopea la tx al tenant
 * por RLS, así que las métricas son inherentemente per-tenant.
 */
export const GET = withTenant(
  async (_req: NextRequest, user, tx) => {
    const metrics = await getTenantMetrics(user.tenantId!, tx)
    return NextResponse.json({ data: metrics })
  },
  // Rate-limit antes de abrir la transacción: el viaje a Upstash no tiene por
  // qué retener una conexión del pool.
  { roles: ['admin'], rateLimit: 'adminCrud' },
)
