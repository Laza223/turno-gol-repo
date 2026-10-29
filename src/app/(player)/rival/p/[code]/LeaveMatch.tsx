'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/shared/types/action-result'
import { RIVAL_GHOST_DESTRUCTIVE } from '../../rival-classes'

/** Firma de la Server Action (por prop, no por import: ver convenciones-stack). */
type LeaveAction = (matchId: string) => Promise<ActionResult>

/**
 * "Me bajo" (spec §5.4): acción discreta (Quiet Ghost Rule) con el copy sin culpa y confirmación.
 * Sin penalidad en v1. Vuelve a aparecer "Voy" cuando el plantel se refresca. El efecto (el lugar
 * queda libre y entra el banco) se dice una sola vez, en el diálogo donde se decide.
 */
export function LeaveMatch({
  matchId,
  leaveAction,
  requested = false,
}: {
  matchId: string
  leaveAction: LeaveAction
  /** El pedido todavía no se aceptó: no hay lugar del que bajarse, se cancela el pedido. */
  requested?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={cn(RIVAL_GHOST_DESTRUCTIVE, 'w-full')}
      >
        {requested ? 'Cancelar pedido' : 'Me bajo'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={requested ? '¿Cancelás tu pedido?' : '¿Te bajás del partido?'}
        description={
          requested
            ? 'El organizador deja de verlo. Si querés, lo pedís de nuevo.'
            : 'Tu lugar queda libre: si hay banco, entra el primero.'
        }
        confirmLabel={requested ? 'Sí, cancelar' : 'Sí, me bajo'}
        cancelLabel={requested ? 'No, lo dejo' : 'No, voy'}
        variant="destructive"
        onConfirm={() => leaveAction(matchId)}
      />
    </>
  )
}
