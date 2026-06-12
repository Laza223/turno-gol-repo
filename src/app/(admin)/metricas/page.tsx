import { redirect } from 'next/navigation'
import { PinGate } from '@/components/pin-gate'
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
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Métricas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Actividad del complejo en los últimos 30 días. Se actualiza cada minuto.
          </p>
        </div>
        <MetricsDashboardLoader canSeeSystem={canSeeSystem} />
      </div>
    </PinGate>
  )
}
