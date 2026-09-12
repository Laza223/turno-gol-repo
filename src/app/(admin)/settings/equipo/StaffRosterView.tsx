import { Check, Lock, UserCog } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import {
  STAFF_ROLES,
  STAFF_ROLE_SPACES,
  STAFF_ROLE_TAGLINES,
  type StaffRole,
} from '@/modules/staff/roles'
import { InviteStaffButton } from './InviteStaffButton'
import {
  ResendInviteButton,
  StaffActions,
  type DeactivateStaffAction,
  type ResendInviteAction,
  type UpdateStaffRoleAction,
} from './StaffActions'
import { StaffRoleBadge, StaffStatusBadge } from './status-visual'
import type { StaffActionResult } from './actions'

/** Firma de inviteStaffAction — DI, ver ReservasPolicyForm.tsx. */
type InviteStaffAction = (formData: FormData) => Promise<StaffActionResult>

export type StaffRosterMember = {
  memberId: string
  staffUserId: string
  firstName: string
  lastName: string
  email: string
  role: StaffRole
  isActive: boolean
  lastLoginAt: Date | null
}

type Props = {
  members: StaffRosterMember[]
  /** staffUserId del actor logueado — oculta sus propias StaffActions y marca "(vos)". */
  staffUserId: string
  /** Feature flag 'tournaments' resuelto server-side para este complejo (equipo/page.tsx). */
  tournamentsEnabled: boolean
  inviteAction: InviteStaffAction
  deactivateAction: DeactivateStaffAction
  resendInviteAction: ResendInviteAction
  updateRoleAction: UpdateStaffRoleAction
}

/** Mismo criterio que `StaffStatusBadge` (status-visual.tsx): invitado que nunca
 *  aceptó (isActive=true desde que se crea la invitación, F-024). */
function isPendingInvite(member: Pick<StaffRosterMember, 'isActive' | 'lastLoginAt'>): boolean {
  return member.isActive && !member.lastLoginAt
}

/**
 * "Qué ve cada persona" (rediseño Equipo, decisión confirmada del dueño):
 * grid con los espacios del panel que abre cada rol fijo, ANTES de la lista
 * de miembros. Fuente de espacios: `STAFF_ROLE_SPACES` (roles.ts), espejo
 * manual de `NAV_ITEMS`/`CONFIG_ITEM` en `admin-sidebar.tsx` (ese archivo es
 * 'use client' y no es importable desde un módulo de dominio). Torneos se
 * omite ENTERO (ni check ni lock, para los dos roles) si el feature flag
 * está apagado para el tenant.
 */
function RoleSpacesCard({ tournamentsEnabled }: { tournamentsEnabled: boolean }) {
  const spaces = STAFF_ROLE_SPACES.filter(
    (space) => !space.requiresTournaments || tournamentsEnabled,
  )

  return (
    <div className="card-premium rounded-lg p-6">
      <h2 className="mb-4 text-base font-semibold text-foreground">Qué ve cada persona</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {STAFF_ROLES.map((role) => (
          <div key={role} className="rounded-xl border border-border bg-muted/30 p-4">
            <StaffRoleBadge role={role} />
            <p className="mt-2 text-sm text-muted-foreground">{STAFF_ROLE_TAGLINES[role]}</p>
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">
              {spaces.map((space) => {
                const accessible = !space.adminOnly || role === 'admin'
                return (
                  <li key={space.label} className="flex items-center gap-1.5 text-sm">
                    {accessible ? (
                      <Check
                        className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className={accessible ? 'text-foreground' : 'text-muted-foreground'}>
                      {space.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Vista Equipo (solo-admin, roles 026), extraída de staff/page.tsx: roster
 * completo con tabla/cards duplicadas manualmente por miembro (patrón
 * ResponsiveList), badges de rol/estado y StaffActions por fila (salvo la
 * propia). Server Actions inyectadas por prop — ver ReservasPolicyForm.tsx.
 *
 * Sin `PageHeader` propio: el nombre de la vista lo dicen las pestañas
 * portaladas en la barra superior (`SettingsTabs`, equipo/page.tsx) y el botón
 * de invitar cuelga de su prop `actions` — ver `InviteStaffButton` en
 * equipo/page.tsx.
 */
export function StaffRosterView({
  members,
  staffUserId,
  tournamentsEnabled,
  inviteAction,
  deactivateAction,
  resendInviteAction,
  updateRoleAction,
}: Props) {
  const activeAdminCount = members.filter((m) => m.isActive && m.role === 'admin').length

  return (
    <div className="space-y-6">
      <RoleSpacesCard tournamentsEnabled={tournamentsEnabled} />

      {members.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Sin miembros de equipo"
          description="Invitá a tu primer encargado o administrador para gestionar el complejo con vos."
          action={
            <InviteStaffButton inviteAction={inviteAction} label="Invitar al primer miembro" />
          }
        />
      ) : (
        <ResponsiveList
          className="shadow-xs"
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
                      <StaffStatusBadge isActive={m.isActive} lastLoginAt={m.lastLoginAt} />
                    </div>
                  </div>
                  {m.staffUserId !== staffUserId && (
                    <div className="flex shrink-0 items-center gap-2">
                      {isPendingInvite(m) && (
                        <ResendInviteButton
                          email={m.email}
                          resendInviteAction={resendInviteAction}
                        />
                      )}
                      <StaffActions
                        member={{
                          memberId: m.memberId,
                          email: m.email,
                          firstName: m.firstName,
                          lastName: m.lastName,
                          isActive: m.isActive,
                          lastLoginAt: m.lastLoginAt,
                          role: m.role,
                        }}
                        currentUserStaffId={staffUserId}
                        activeAdminCount={activeAdminCount}
                        deactivateAction={deactivateAction}
                        resendInviteAction={resendInviteAction}
                        updateRoleAction={updateRoleAction}
                      />
                    </div>
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
                    <td className="p-3">
                      <p className="text-sm font-medium text-foreground">
                        {m.firstName} {m.lastName}
                        {m.staffUserId === staffUserId && (
                          <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{m.email}</p>
                    </td>
                    <td className="p-3">
                      <StaffRoleBadge role={m.role} />
                    </td>
                    <td className="p-3">
                      <StaffStatusBadge isActive={m.isActive} lastLoginAt={m.lastLoginAt} />
                    </td>
                    <td className="p-3 text-right">
                      {m.staffUserId !== staffUserId && (
                        <div className="flex items-center justify-end gap-2">
                          {isPendingInvite(m) && (
                            <ResendInviteButton
                              email={m.email}
                              resendInviteAction={resendInviteAction}
                            />
                          )}
                          <StaffActions
                            member={{
                              memberId: m.memberId,
                              email: m.email,
                              firstName: m.firstName,
                              lastName: m.lastName,
                              isActive: m.isActive,
                              lastLoginAt: m.lastLoginAt,
                              role: m.role,
                            }}
                            currentUserStaffId={staffUserId}
                            activeAdminCount={activeAdminCount}
                            deactivateAction={deactivateAction}
                            resendInviteAction={resendInviteAction}
                            updateRoleAction={updateRoleAction}
                          />
                        </div>
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
