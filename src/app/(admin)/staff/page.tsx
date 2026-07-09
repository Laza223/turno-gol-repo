import { UserCog } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { requireAdminStaff } from '@/modules/staff/guards'
import { listStaffRoster } from '@/modules/staff/staff.service'
import { InviteStaffButton } from './InviteStaffButton'
import { StaffActions } from './StaffActions'
import { StaffRoleBadge, StaffStatusBadge } from './status-visual'
import { inviteStaffAction } from './actions'

export default async function StaffPage() {
  // Vista Equipo solo-admin (roles 026): Encargado/Solo lectura → /dashboard.
  // Guard corre ANTES de leer el roster — listStaffRoster no re-autoriza.
  const { user, tenant } = await requireAdminStaff()
  const staffUserId: string = user.staffUserId

  const members = await listStaffRoster(tenant.id)
  const activeCount = members.filter((m) => m.isActive).length
  const activeAdminCount = members.filter((m) => m.isActive && m.role === 'admin').length
  return (
    <div className="space-y-6">
        <PageHeader
          title="Equipo"
          subtitle={`${activeCount} miembro${activeCount !== 1 ? 's' : ''} del equipo activo${activeCount !== 1 ? 's' : ''}`}
          icon={<UserCog className="h-6 w-6" aria-hidden="true" />}
          actions={<InviteStaffButton inviteAction={inviteStaffAction} />}
        />

        {members.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Sin miembros de equipo"
            description="Invitá a tu primer encargado o administrador para gestionar el complejo con vos."
            action={
              <InviteStaffButton inviteAction={inviteStaffAction} label="Invitar al primer miembro" />
            }
          />
        ) : (
          <ResponsiveList
            className="shadow-sm"
            cards={
              <ul className="divide-y divide-border">
                {members.map((m) => (
                  <li key={m.memberId} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {m.firstName} {m.lastName}
                        {m.staffUserId === staffUserId && (
                          <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StaffRoleBadge role={m.role} />
                        <StaffStatusBadge isActive={m.isActive} />
                      </div>
                    </div>
                    {m.staffUserId !== staffUserId && (
                      <StaffActions
                        member={{
                          memberId: m.memberId,
                          email: m.email,
                          firstName: m.firstName,
                          lastName: m.lastName,
                          isActive: m.isActive,
                          role: m.role,
                        }}
                        currentUserStaffId={staffUserId}
                        activeAdminCount={activeAdminCount}
                      />
                    )}
                  </li>
                ))}
              </ul>
            }
            table={
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Nombre
                  </th>
                  <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Email
                  </th>
                  <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Rol
                  </th>
                  <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Estado
                  </th>
                  <th className="p-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <tr key={m.memberId} className="hover:bg-accent/50 transition-colors">
                    <td className="p-3 text-sm font-medium text-foreground">
                      {m.firstName} {m.lastName}
                      {m.staffUserId === staffUserId && (
                        <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                      )}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{m.email}</td>
                    <td className="p-3">
                      <StaffRoleBadge role={m.role} />
                    </td>
                    <td className="p-3">
                      <StaffStatusBadge isActive={m.isActive} />
                    </td>
                    <td className="p-3 text-right">
                      {m.staffUserId !== staffUserId && (
                        <StaffActions
                          member={{
                            memberId: m.memberId,
                            email: m.email,
                            firstName: m.firstName,
                            lastName: m.lastName,
                            isActive: m.isActive,
                            role: m.role,
                          }}
                          currentUserStaffId={staffUserId}
                          activeAdminCount={activeAdminCount}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            }
          />
        )}
      </div>
  )
}
