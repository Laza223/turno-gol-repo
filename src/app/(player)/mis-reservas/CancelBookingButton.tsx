'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatArs } from '@/lib/format'
import { useRefundDialog } from './RefundDialogProvider'
import type { PlayerBookingActionResult } from './actions'

/** Firma de la Server Action que ejecuta la cancelación. */
export type CancelMyBookingAction = (
  bookingId: string,
  reason?: string,
) => Promise<PlayerBookingActionResult>

/** ENS-2: consecuencia concreta de cancelar AHORA (getCancellationPreview). */
type CancellationOutcome = 'no_deposit' | 'refund' | 'no_refund'

type Props = {
  bookingId: string
  courtName: string
  dateLabel: string
  timeLabel: string
  /**
   * Consecuencia de cancelar ESTE turno AHORA, calculada server-side con la
   * misma política que usa `cancelByPlayer` (no es una regla nueva del front).
   */
  cancellationOutcome: CancellationOutcome
  /** Monto de la seña en centavos — solo relevante si cancellationOutcome !== 'no_deposit'. */
  depositAmountCents: number
  /**
   * La action llega por PROP, no por import: './actions' es `'use server'` y
   * arrastra drizzle/postgres + `node:async_hooks` (vía request-context), lo
   * que rompe cualquier bundle de browser (Storybook) si se importa como
   * valor. El type import de `PlayerBookingActionResult` sí es seguro: se
   * borra en compilación.
   */
  action: CancelMyBookingAction
}

/** ENS-2: reemplaza el texto abstracto ("si estás en el plazo... fuera del
 * plazo...") por la consecuencia concreta de cancelar ESTE turno. */
function depositPreviewText(outcome: CancellationOutcome, amountCents: number): string {
  if (outcome === 'no_deposit') return 'No hay seña que devolver.'
  if (outcome === 'refund') return `Se te devuelve la seña de ${formatArs(amountCents)}.`
  return `Perdés la seña de ${formatArs(amountCents)}.`
}

export function CancelBookingButton({
  bookingId,
  courtName,
  dateLabel,
  timeLabel,
  cancellationOutcome,
  depositAmountCents,
  action,
}: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  // El diálogo de la devolución NO se renderiza acá: la Server Action revalida
  // /mis-reservas y esta tarjeta desaparece de "Próximos", con lo que React la
  // desmonta y se lleva puesto cualquier diálogo que fuera hijo suyo. Lo
  // muestra `RefundDialogProvider`, que está por encima de la lista.
  const showRefundDialog = useRefundDialog()

  async function handleConfirm() {
    const result = await action(bookingId, reason.trim() || undefined)
    if (!result.success) {
      return { success: false as const, error: result.error }
    }
    // Se avisa hacia arriba y se termina: no hace falta `router.refresh()`
    // porque la propia Server Action ya hizo `revalidatePath('/mis-reservas')`.
    if (result.refund) showRefundDialog(result.refund)
    return { success: true as const }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-[color,background-color,scale] h-11 px-3 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 active:scale-[0.98]"
      >
        Cancelar
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Cancelar esta reserva?"
        description={
          <>
            Reserva en <strong>{courtName}</strong> el <strong>{dateLabel}</strong> a las{' '}
            <strong>{timeLabel}</strong>.
            <br />
            <br />
            {depositPreviewText(cancellationOutcome, depositAmountCents)}
          </>
        }
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        variant="destructive"
        onConfirm={handleConfirm}
      >
        <div className="space-y-1">
          <label htmlFor="cancel-reason" className="text-xs font-medium text-foreground">
            Motivo (opcional)
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ej: no puedo ir, lluvia, equivocación de horario..."
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 resize-none"
          />
        </div>
      </ConfirmDialog>
    </>
  )
}
