'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ActionResult } from '@/shared/types/action-result'

/** Firma de la Server Action (por prop, no por import: ver convenciones-stack). */
type LeaveAction = (matchId: string) => Promise<ActionResult>

/**
 * "Me bajo" (spec §5.4): acción discreta (Quiet Ghost Rule) con el copy sin culpa y confirmación.
 * Sin penalidad en v1. Vuelve a aparecer "Voy" cuando el plantel se refresca.
 */
export function LeaveMatch({
  matchId,
  leaveAction,
}: {
  matchId: string
  leaveAction: LeaveAction
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">
        Si no podés ir, bajate a tiempo: alguien del banco ocupa tu lugar.
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-11 px-3 text-sm font-medium"
      >
        Me bajo
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Te bajás del partido?"
        description="Tu lugar queda libre: si hay banco, entra el primero."
        confirmLabel="Sí, me bajo"
        cancelLabel="No, voy"
        variant="destructive"
        onConfirm={() => leaveAction(matchId)}
      />
    </div>
  )
}
