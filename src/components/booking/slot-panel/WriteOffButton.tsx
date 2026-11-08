'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/shared/types/action-result'
import type { WriteOffActions } from './actions'

/**
 * "Dar por perdido": el staff resigna lo que falta de un turno ya jugado.
 * Secundario y sin relleno a propósito: el botón de arriba es cobrar, y esto
 * solo se toca a conciencia (pide confirmación). El "Deshacer" vive SOLO en el
 * aviso de éxito (docs/decisions/2026-11-07-cobrar-varios-y-dar-por-perdido.md).
 *
 * Las acciones llegan por prop, nunca por import: rompe Storybook.
 */
export function WriteOffButton({
  bookingId,
  pendingCents,
  paidCents,
  actions,
  disabled = false,
  onDone,
  className,
}: {
  bookingId: string
  /** Lo que falta: es lo que se manda como `expectedPendingCents`. */
  pendingCents: number
  /** Lo que ya entró: con eso se cierra el turno. */
  paidCents: number
  actions: WriteOffActions
  disabled?: boolean
  /** Se dio por perdido (o se deshizo): hay que refrescar la pantalla. */
  /** Se dio por perdido (`cents` > 0) o se deshizo (0): el caller refresca. */
  onDone: (writtenOffCents: number) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)

  async function undo() {
    try {
      const res = await actions.undoWriteOffAction({ bookingId })
      if (!res.success) {
        toast({ title: res.error ?? 'No se pudo deshacer.', variant: 'destructive' })
        return
      }
      toast({ title: 'Se deshizo', variant: 'success' })
      onDone(0)
    } catch (err) {
      Sentry.captureException(err)
      toast({ title: 'No se pudo deshacer.', variant: 'destructive' })
    }
  }

  async function confirm(): Promise<ActionResult> {
    const res = await actions.writeOffBookingAction({
      bookingId,
      expectedPendingCents: pendingCents,
    })
    if (!res.success) return res
    toast({
      title: `Se dio por perdido ${formatArs(res.amount)}`,
      variant: 'success',
      action: { label: 'Deshacer', onClick: () => void undo() },
    })
    onDone(res.amount)
    return { success: true }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'h-11 w-full rounded-lg border border-border bg-transparent text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10',
          className,
        )}
      >
        Dar por perdido
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Dar por perdidos ${formatArs(pendingCents)}?`}
        description={`El turno se cierra con lo que entró (${formatArs(paidCents)}). Esos ${formatArs(pendingCents)} no se cuentan como cobrados.`}
        confirmLabel="Dar por perdido"
        cancelLabel="Volver"
        onConfirm={confirm}
      />
    </>
  )
}
