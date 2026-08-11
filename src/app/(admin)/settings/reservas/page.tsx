import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { ReservasPolicyForm } from './ReservasPolicyForm'
import { updateReservasPolicyAction } from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function ReservasPolicyPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const s = tenant.settings

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

      <SettingsTabs active="/settings/reservas" />

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Políticas de Reserva</h2>
        <ReservasPolicyForm s={s} action={updateReservasPolicyAction} />
      </div>
    </div>
  )
}
