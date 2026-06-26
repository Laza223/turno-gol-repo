'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import { STAFF_ROLES, STAFF_ROLE_LABELS, type StaffRole } from '@/modules/staff/roles'
import { deactivateStaffAction, resendInviteAction, updateStaffRoleAction } from './actions'

// The deactivate confirmation pulls in the Radix AlertDialog (~13KB). It is only
// needed once an admin opens it, so lazy-load and mount it on demand instead of
// shipping it in every Staff row's initial chunk.
const ConfirmDialog = dynamic(
  () => import('@/components/ui/confirm-dialog').then((m) => m.ConfirmDialog),
  { ssr: false },
)

interface StaffActionsProps {
  member: {
    memberId: string
    email: string
    firstName: string
    lastName: string
    isActive: boolean
    role: StaffRole
  }
  currentUserStaffId: string
  activeAdminCount: number
}

export function StaffActions({ member, currentUserStaffId: _currentUserStaffId, activeAdminCount }: StaffActionsProps) {
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  // Lockout: el último admin activo no se puede desactivar (misma regla que
  // valida el server en deactivateStaffAction).
  const isLastActiveAdmin = member.role === 'admin' && activeAdminCount <= 1
  const otherRoles = STAFF_ROLES.filter((role) => role !== member.role)

  async function handleChangeRole(role: StaffRole) {
    const res = await updateStaffRoleAction(member.memberId, role)
    if (res.success) {
      toast({
        title: `${member.firstName} ${member.lastName} ahora es ${STAFF_ROLE_LABELS[role]}.`,
        variant: 'success',
      })
    } else {
      toast({ title: res.error ?? 'No se pudo cambiar el rol.', variant: 'destructive' })
    }
  }

  async function onConfirmDeactivate(): Promise<{ success: boolean; error?: string }> {
    const res = await deactivateStaffAction(member.memberId)
    if (!res.success) {
      return { success: false, error: res.error }
    }
    toast({ title: `${member.firstName} ${member.lastName} fue desactivado/a.`, variant: 'success' })
    return { success: true }
  }

  async function handleResendInvite() {
    const res = await resendInviteAction(member.email)
    if (res.success) {
      toast({ title: 'Invitación reenviada correctamente.', variant: 'success' })
    } else {
      toast({ title: res.error ?? 'No se pudo reenviar la invitación.', variant: 'destructive' })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Opciones">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {member.isActive ? (
            <>
              {otherRoles.map((role) => (
                <DropdownMenuItem
                  key={role}
                  className="cursor-pointer"
                  onSelect={() => {
                    void handleChangeRole(role)
                  }}
                >
                  Cambiar a {STAFF_ROLE_LABELS[role]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600"
                disabled={isLastActiveAdmin}
                onSelect={(e) => {
                  e.preventDefault()
                  setDeactivateOpen(true)
                }}
              >
                Desactivar
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => {
                void handleResendInvite()
              }}
            >
              Reenviar invitación
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {deactivateOpen && (
      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Desactivar ${member.firstName} ${member.lastName}`}
        description={
          <div className="space-y-2">
            <p>Al desactivar este miembro:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Pierde acceso al panel inmediatamente.</li>
              <li>Sus sesiones activas se invalidan.</li>
              <li>El historial de actividad no se borra.</li>
            </ul>
          </div>
        }
        variant="destructive"
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        confirmationPhrase={member.email}
        onConfirm={onConfirmDeactivate}
      />
      )}
    </>
  )
}
