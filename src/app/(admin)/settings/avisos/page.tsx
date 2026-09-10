import { Bell } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { PageHeader } from '@/components/admin/PageHeader'
import { AvisosForm } from './AvisosForm'
import { updateAvisosSettingsAction } from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function AvisosPage() {
  const { tenant } = await requireAdminStaff()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avisos"
        subtitle="Cómo te avisamos de las reservas y los pagos nuevos."
        icon={<Bell className="h-6 w-6" aria-hidden="true" />}
      />

      <SettingsTabs active="/settings/avisos" />

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Avisos</h2>
        <AvisosForm s={tenant.settings} action={updateAvisosSettingsAction} />
      </div>
    </div>
  )
}
