import { eq } from 'drizzle-orm'
import { UserCog } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import type { StaffRole } from '@/modules/staff/roles'
import { InviteStaffButton } from './InviteStaffButton'
import { StaffActions } from './StaffActions'
import { StaffRoleBadge, StaffStatusBadge } from './status-visual'
import { inviteStaffAction } from './actions'

interface StaffMember {
  memberId: string
  staffUserId: string
  firstName: string
  lastName: string
  email: string
  role: StaffRole
  isActive: boolean
  createdAt: Date
}

async function getStaffMembers(tenantId: string): Promise<StaffMember[]> {
  return withTenantContext(tenantId, async (tx) => {
    return tx
      .select({
        memberId: tenantStaffMembers.id,
        staffUserId: staffUsers.id,
        firstName: staffUsers.firstName,
        lastName: staffUsers.lastName,
        email: staffUsers.email,
        role: tenantStaffMembers.role,
        isActive: tenantStaffMembers.isActive,
        createdAt: tenantStaffMembers.createdAt,
      })
      .from(tenantStaffMembers)
      .innerJoin(staffUsers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
      .where(eq(tenantStaffMembers.tenantId, tenantId))
      .orderBy(tenantStaffMembers.createdAt)
  })
}

export default async function StaffPage() {
  // Vista Equipo solo-admin (roles 026): Encargado/Solo lectura → /dashboard.
  const { user, tenant } = await requireAdminStaff()
  const staffUserId: string = user.staffUserId

  const members = await getStaffMembers(tenant.id)
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
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full">
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
          </div>
        )}
      </div>
  )
}
