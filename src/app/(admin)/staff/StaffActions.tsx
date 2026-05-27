'use client'

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { deactivateStaffAction, resendInviteAction } from './actions'

interface StaffActionsProps {
  member: {
    memberId: string
    email: string
    firstName: string
    lastName: string
    isActive: boolean
  }
  currentUserStaffId: string
  activeCount: number
}

export function StaffActions({ member, currentUserStaffId: _currentUserStaffId, activeCount }: StaffActionsProps) {
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const isSoleAdmin = activeCount <= 1

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
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-600"
              disabled={isSoleAdmin}
              onSelect={(e) => {
                e.preventDefault()
                setDeactivateOpen(true)
              }}
            >
              Desactivar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={(e) => {
                e.preventDefault()
                void handleResendInvite()
              }}
            >
              Reenviar invitación
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  )
}
