import { requireAdminStaff } from '@/modules/staff/guards'
import { listStaffRoster } from '@/modules/staff/staff.service'
import { StaffRosterView } from './StaffRosterView'
import {
  deactivateStaffAction,
  inviteStaffAction,
  resendInviteAction,
  updateStaffRoleAction,
} from './actions'

export default async function StaffPage() {
  // Vista Equipo solo-admin (roles 026): Encargado/Solo lectura → /dashboard.
  // Guard corre ANTES de leer el roster — listStaffRoster no re-autoriza.
  const { user, tenant } = await requireAdminStaff()
  const staffUserId: string = user.staffUserId

  const members = await listStaffRoster(tenant.id)

  return (
    <StaffRosterView
      members={members}
      staffUserId={staffUserId}
      inviteAction={inviteStaffAction}
      deactivateAction={deactivateStaffAction}
      resendInviteAction={resendInviteAction}
      updateRoleAction={updateStaffRoleAction}
    />
  )
}
