import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { AvisosForm } from './AvisosForm'
import { updateAvisosSettingsAction } from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function AvisosPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

      <SettingsTabs active="/settings/avisos" />

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Avisos</h2>
        <AvisosForm s={tenant.settings} action={updateAvisosSettingsAction} />
      </div>
    </div>
  )
}
