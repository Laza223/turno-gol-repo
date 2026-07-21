import { redirect } from 'next/navigation'
import { ChartLine, Download } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { MetricsDashboardLoader } from '@/app/(admin)/metricas/MetricsDashboardLoader'
import { todayART } from '@/shared/time/art-date'

/**
 * Dashboard de analíticas (/analiticas). Absorbe /metricas + export CSV de /reportes.
 * Zona sensible: va detrás del PinGate (ingresos visibles).
 * El panel "Estado del sistema" se renderiza solo para rol 'admin'.
 */
export default async function AnaliticasPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const canSeeSystem = (await getStaffRole(tenant.id, user.staffUserId)) === 'admin'

  // CSV export: último mes completo (30 días atrás desde hoy)
  const today = todayART()
  const thirtyDaysAgo = new Date(new Date(today).getTime() - 30 * 86400_000)
    .toISOString()
    .split('T')[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analíticas"
        subtitle="Actividad del complejo en los últimos 30 días. Se actualiza cada minuto."
        icon={<ChartLine className="h-6 w-6" aria-hidden="true" />}
        actions={
          <a
            href={`/api/reports/revenue?from=${thirtyDaysAgo}&to=${today}&format=csv`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </a>
        }
      />
      <MetricsDashboardLoader canSeeSystem={canSeeSystem} />
    </div>
  )
}
