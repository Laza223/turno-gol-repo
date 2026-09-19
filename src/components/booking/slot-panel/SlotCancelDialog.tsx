'use client'

import { useState } from 'react'
import type { ActionResult } from '@/shared/types/action-result'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { SlotPanelActions } from './actions'

type CancelType = 'complejo' | 'jugador'

/**
 * Cancelar la reserva, con los avisos de reembolso. Lo comparten el panel de la
 * Grilla y el modal de Hoy: el texto de qué pasa con la seña es de los más
 * delicados de la app (plata del cliente) y no puede existir en dos copias que
 * se desincronicen.
 *
 * El estado del formulario (quién cancela, el motivo) vive acá adentro y se
 * limpia cada vez que el diálogo se abre — mismo patrón "derived state on prop
 * change" que usan los paneles, sin `useEffect`.
 */
export function SlotCancelDialog({
  open,
  onOpenChange,
  booking,
  label,
  hasEnded,
  cancelAction,
  onCancelled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: GridBooking
  /** A quién se cancela: el nombre del cliente, o el rótulo del estado si no hay. */
  label: string
  hasEnded: boolean
  cancelAction: NonNullable<SlotPanelActions['cancelBookingAction']>
  /** Se canceló: el caller refresca y decide qué cerrar. */
  onCancelled: () => void
}) {
  const [cancelType, setCancelType] = useState<CancelType | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [wasOpen, setWasOpen] = useState(false)

  if (open && !wasOpen) {
    setWasOpen(true)
    setCancelType(null)
    setCancelReason('')
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  async function onConfirmCancel(): Promise<ActionResult> {
    if (!cancelType) return { success: false, error: 'Indicá quién cancela la reserva.' }
    if (cancelReason.trim().length < 3) {
      return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    }
    const res = await cancelAction(booking.id, cancelReason.trim(), cancelType)
    if (res.success) {
      // H093: mismo toast que BookingActions.tsx/QuickActions.tsx tras la
      // MISMA acción — acá se cerraba en silencio.
      toast({ title: 'Reserva cancelada', variant: 'success' })
      onCancelled()
    }
    return res
  }

  // Sin `startsAt`/`cancellationPolicyHours` a mano (GridBooking no los trae —
  // ver su comentario): mismo fallback genérico que usa QuickActions.tsx cuando
  // esos datos faltan (`inPolicy === null`), no un mensaje inventado nuevo.
  const hasPaidDeposit = booking.depositStatus === 'paid' && (booking.depositAmount ?? 0) > 0
  // H095: visible DESDE que se abre el diálogo, no recién tras elegir "quién
  // cancela" — mismo criterio que `refundPreview` en BookingActions.tsx (ENS-2).
  let cancelRefundWarning: string | null = null
  if (!hasPaidDeposit) {
    cancelRefundWarning = 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
  } else if (hasEnded) {
    cancelRefundWarning = 'El turno ya se jugó: la seña queda para el complejo (sin reembolso).'
  } else if (!cancelType) {
    cancelRefundWarning = `Hay una seña de ${formatArs(booking.depositAmount ?? 0)} pagada: el reembolso depende de quién cancela (elegí una opción abajo).`
  } else if (cancelType === 'complejo') {
    cancelRefundWarning =
      booking.paymentMethod === 'mercadopago'
        ? `La seña de ${formatArs(booking.depositAmount ?? 0)} queda para devolver: hacelo vos desde tu MercadoPago (no es automático) — si la devolvés ahí, el sistema la marca sola.`
        : `La seña de ${formatArs(booking.depositAmount ?? 0)} queda para devolver: la devolvés vos (efectivo o transferencia) y la marcás en Caja → Cuentas.`
  } else {
    cancelRefundWarning = `Se aplica la política de cancelación: reembolso de ${formatArs(booking.depositAmount ?? 0)} si está dentro del plazo, retención si no.`
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancelar reserva"
      description={`${label}, ${booking.timeStart}–${booking.timeEnd}. Esta acción cancela el turno y libera el horario. Ingresá el motivo.`}
      variant="destructive"
      confirmLabel="Cancelar reserva"
      cancelLabel="Volver"
      onConfirm={onConfirmCancel}
    >
      <div className="space-y-3">
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground">¿Quién cancela?</legend>
          <RadioChipGroup
            value={cancelType ?? ''}
            onValueChange={(v) => setCancelType(v as CancelType)}
          >
            <RadioChip
              value="complejo"
              description={
                hasPaidDeposit
                  ? 'Rotura, mantenimiento o error. La seña queda para que se la devuelvas vos.'
                  : 'Rotura, mantenimiento o error.'
              }
            >
              El complejo necesita cancelar
            </RadioChip>
            <RadioChip
              value="jugador"
              description="Se aplica la política de cancelación del complejo."
            >
              El jugador pidió cancelar
            </RadioChip>
          </RadioChipGroup>
        </fieldset>
        {cancelRefundWarning && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
            {cancelRefundWarning}
          </div>
        )}
        <div className="space-y-1">
          <label
            htmlFor={`slot-cancel-reason-${booking.id}`}
            className="text-xs font-medium text-foreground"
          >
            Motivo (obligatorio)
          </label>
          <textarea
            id={`slot-cancel-reason-${booking.id}`}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>
      </div>
    </ConfirmDialog>
  )
}
