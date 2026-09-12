import { requireAdminStaff } from '@/modules/staff/guards'
import { listStaffRoster } from '@/modules/staff/staff.service'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { StaffRosterView } from '@/app/(admin)/settings/equipo/StaffRosterView'
import { InviteStaffButton } from '@/app/(admin)/settings/equipo/InviteStaffButton'
import {
  deactivateStaffAction,
  inviteStaffAction,
  resendInviteAction,
  updateStaffRoleAction,
} from '@/app/(admin)/settings/equipo/actions'
import { SettingsTabs } from '../SettingsTabs'

export default async function SettingsEquipoPage() {
  const { user, tenant } = await requireAdminStaff()
  const staffUserId: string = user.staffUserId

  const [members, tournamentsEnabled] = await Promise.all([
    listStaffRoster(tenant.id),
    isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id),
  ])

  return (
    <div className="space-y-6">
      {/* MASTER §6.8: sin PageHeader propio — las pestañas portaladas ya
          nombran la vista. El botón de invitar (antes en el `actions` del
          PageHeader que StaffRosterView.tsx eliminó) cuelga acá del mismo
          slot de acciones que usa el resto de las pestañas de Configuración. */}
      <SettingsTabs
        active="/settings/equipo"
        actions={<InviteStaffButton inviteAction={inviteStaffAction} />}
      />
      <StaffRosterView
        members={members}
        staffUserId={staffUserId}
        tournamentsEnabled={tournamentsEnabled}
        inviteAction={inviteStaffAction}
        deactivateAction={deactivateStaffAction}
        resendInviteAction={resendInviteAction}
        updateRoleAction={updateStaffRoleAction}
      />
    </div>
  )
}
