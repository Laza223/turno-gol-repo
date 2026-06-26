import { eq } from 'drizzle-orm'
import { Mail, UserCog } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import { PinGate } from '@/components/pin-gate'
import { STAFF_ROLE_LABELS, type StaffRole } from '@/modules/staff/roles'
import { InviteStaffButton } from './InviteStaffButton'
import { StaffActions } from './StaffActions'
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

// Estilo del badge por rol: admin resalta (es el de acceso total), los demás
// usan tonos neutros/fríos.
const ROLE_BADGE_CLASSES: Record<StaffRole, string> = {
  admin: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-600/20 dark:ring-violet-500/30',
  manager: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-600/20 dark:ring-sky-500/30',
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
  const hasPin = !!tenant.settings.staff_pin_hash

  return (
    <PinGate pinRequired={hasPin}>
      <div className="space-y-6">
        <PageHeader
          title="Equipo"
          subtitle={`${activeCount} miembro${activeCount !== 1 ? 's' : ''} del equipo activo${activeCount !== 1 ? 's' : ''}`}
          icon={<UserCog className="h-6 w-6" aria-hidden="true" />}
          actions={<InviteStaffButton inviteAction={inviteStaffAction} />}
        />

        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estado
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.memberId} className="hover:bg-accent">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    {m.firstName} {m.lastName}
                    {m.staffUserId === staffUserId && (
                      <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{m.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ROLE_BADGE_CLASSES[m.role]}`}
                    >
                      {STAFF_ROLE_LABELS[m.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {m.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-500/30">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-slate-500/20">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
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

          {members.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Mail className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No hay miembros de equipo aún.</p>
            </div>
          )}
        </div>
      </div>
    </PinGate>
  )
}
