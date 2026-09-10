import { ClipboardList } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { PageHeader } from '@/components/admin/PageHeader'
import { ReservasPolicyForm } from './ReservasPolicyForm'
import { updateReservasPolicyAction } from './actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function ReservasPolicyPage() {
  const { tenant } = await requireAdminStaff()

  const s = tenant.settings

  return (
    <div className="space-y-6">
      {/* H022: unificada al mismo PageHeader que ya usan perfil/avisos/canchas/equipo —
          el resto de Configuración resolvía la cabecera con un <h1> genérico "Configuración". */}
      <PageHeader
        title="Reservas"
        subtitle="Seña, anticipación y política de cancelación de las reservas online."
        icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
      />

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
