import { requireAdminStaff } from '@/modules/staff/guards'
import { AvisosForm } from './AvisosForm'
import { updateAvisosSettingsAction } from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function AvisosPage() {
  const { tenant } = await requireAdminStaff()

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
