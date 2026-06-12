import { eq } from 'drizzle-orm'
import { Mail } from 'lucide-react'
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
  admin: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  manager: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  read_only: 'bg-slate-100 text-slate-600 ring-slate-500/20',
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Equipo</h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeCount} miembro{activeCount !== 1 ? 's' : ''} del equipo activo{activeCount !== 1 ? 's' : ''}
            </p>
          </div>

          <InviteStaffButton inviteAction={inviteStaffAction} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Rol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Estado
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.memberId} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {m.firstName} {m.lastName}
                    {m.staffUserId === staffUserId && (
                      <span className="ml-2 text-xs text-slate-400">(vos)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{m.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ROLE_BADGE_CLASSES[m.role]}`}
                    >
                      {STAFF_ROLE_LABELS[m.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {m.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
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
              <Mail className="h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm text-slate-500">No hay miembros de equipo aún.</p>
            </div>
          )}
        </div>
      </div>
    </PinGate>
  )
}
