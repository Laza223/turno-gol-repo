import { requireAdminStaff } from '@/modules/staff/guards'
import { ReservasPolicyForm } from './ReservasPolicyForm'
import { updateReservasPolicyAction } from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function ReservasPolicyPage() {
  const { tenant } = await requireAdminStaff()

  const s = tenant.settings

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

      <SettingsTabs active="/settings/reservas" />

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Políticas de Reserva</h2>
        <ReservasPolicyForm
          s={s}
          action={updateReservasPolicyAction}
          mpConnected={!!tenant.mpConnectedAt}
        />
      </div>
    </div>
  )
}
