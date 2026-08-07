import { requireAdminStaff } from '@/modules/staff/guards'
import { listStaffRoster } from '@/modules/staff/staff.service'
import { StaffRosterView } from '@/app/(admin)/settings/equipo/StaffRosterView'
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

  const members = await listStaffRoster(tenant.id)

  return (
    <div className="space-y-6">
      <SettingsTabs active="/settings/equipo" />
      <StaffRosterView
        members={members}
        staffUserId={staffUserId}
        inviteAction={inviteStaffAction}
        deactivateAction={deactivateStaffAction}
        resendInviteAction={resendInviteAction}
        updateRoleAction={updateStaffRoleAction}
      />
    </div>
  )
}
