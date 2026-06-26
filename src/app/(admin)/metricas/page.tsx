import { redirect } from 'next/navigation'
import { ChartLine } from 'lucide-react'
import { PinGate } from '@/components/pin-gate'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { MetricsDashboardLoader } from './MetricsDashboardLoader'

/**
 * Dashboard de observabilidad (/metricas). Muestra ingresos → zona sensible:
 * va detrás del PinGate igual que /reportes. El panel "Estado del sistema" se
 * renderiza solo para rol 'admin' leído de la DB (el claim del JWT está
 * hardcodeado); el endpoint /api/admin/system-status lo refuerza server-side.
 */
export default async function MetricasPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const canSeeSystem = (await getStaffRole(tenant.id, user.staffUserId)) === 'admin'
  const hasPin = !!tenant.settings.staff_pin_hash

  return (
    <PinGate pinRequired={hasPin}>
      <div className="space-y-6">
        <PageHeader
          title="Métricas"
          subtitle="Actividad del complejo en los últimos 30 días. Se actualiza cada minuto."
          icon={<ChartLine className="h-6 w-6" aria-hidden="true" />}
        />
        <MetricsDashboardLoader canSeeSystem={canSeeSystem} />
      </div>
    </PinGate>
  )
}
