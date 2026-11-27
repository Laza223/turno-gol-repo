import { requireAdminStaff } from '@/modules/staff/guards'
import { artTodayStr } from '@/shared/dates/art'
import { SettingsHeader } from '../SettingsHeader'
import { DatosView } from './DatosView'
import { exportAbonadosAction, exportBookingsAction, exportClientsAction } from './actions'

/**
 * Ajustes → Tus datos. Solo el dueño: el layout de Ajustes ya rebota al
 * encargado, y cada acción vuelve a chequearlo (spec 2026-10-22 §6.1).
 */
export default async function DatosPage() {
  const { tenant } = await requireAdminStaff({ allowReadOnly: true })

  return (
    <div className="space-y-3 lg:space-y-6">
      <SettingsHeader title="Tus datos" />
      <DatosView
        fileStem={`${tenant.slug}-${artTodayStr()}`}
        exportBookingsAction={exportBookingsAction}
        exportAbonadosAction={exportAbonadosAction}
        exportClientsAction={exportClientsAction}
      />
    </div>
  )
}
