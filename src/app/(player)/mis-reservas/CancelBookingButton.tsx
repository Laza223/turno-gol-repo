'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { lateCancelPlayerText, type LateCancelPenalty } from '@/modules/bookings/late-cancel'
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
  /** Cancelar AHORA cuenta como tardía (complejo sin seña); `hours` = umbral del complejo. */
  lateCancel?: (LateCancelPenalty & { hours: number }) | null
  /** Nombre del complejo, para el aviso de bloqueo. */
  tenantName?: string
  /** Ids del contexto de la tarjeta (cuándo y dónde): el botón sigue llamándose "Cancelar" a secas. */
  describedBy?: string
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

const LOST_RESPONSE_ERROR =
  'No pudimos confirmar si se canceló. Fijate si la reserva sigue en Próximos; si sigue, probá de nuevo.'

export function CancelBookingButton({
  bookingId,
  courtName,
  dateLabel,
  timeLabel,
  cancellationOutcome,
  depositAmountCents,
  lateCancel,
  tenantName,
  describedBy,
  action,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  // El diálogo de la devolución NO se renderiza acá: la Server Action revalida
  // /mis-reservas y esta tarjeta desaparece de "Próximos", con lo que React la
  // desmonta y se lleva puesto cualquier diálogo que fuera hijo suyo. Lo
  // muestra `RefundDialogProvider`, que está por encima de la lista.
  const showRefundDialog = useRefundDialog()

  async function handleConfirm() {
    let result: PlayerBookingActionResult
    try {
      result = await action(bookingId, reason.trim() || undefined)
    } catch (err) {
      // La action LANZA cuando la respuesta no vuelve (4G que se corta): la reserva
      // pudo haberse cancelado igual. Se refresca la lista y se dice la verdad;
      // reintentar es seguro porque `cancelByPlayer` es idempotente.
      //
      // El aviso va al Toaster y el diálogo se cierra, NO queda inline: `router.refresh()`
      // entra en el carril de la acción y suspende la transición, así que el `setError`
      // de ConfirmDialog (envuelto en `startTransition`) esperaría al RSC y el diálogo
      // se quedaba en "Procesando…" con "Volver" deshabilitado (convenciones-stack,
      // "Server Actions y forms"). El store del toast no pasa por React: pinta ya.
      Sentry.captureException(err)
      toast({ title: LOST_RESPONSE_ERROR, variant: 'destructive' })
      router.refresh()
      return { success: true as const }
    }
    if (!result.success) {
      if (!result.stale) return { success: false as const, error: result.error }
      // Error de estado: la revalidación ya puede haber sacado esta tarjeta (y este
      // diálogo con ella), así que el aviso va al Toaster global y se cierra.
      toast({ title: result.error, variant: 'destructive' })
      return { success: true as const }
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
        aria-describedby={describedBy}
        data-ghost
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-red-700 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:text-red-300"
      >
        Cancelar
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Cancelar esta reserva?"
        description={
          <>
            Reserva en <strong>{courtName}</strong> el <strong>{dateLabel}</strong>, de{' '}
            <strong className="tabular-nums">{timeLabel}</strong>.
            <br />
            <br />
            {depositPreviewText(cancellationOutcome, depositAmountCents)}
            {lateCancel && (
              <>
                <br />
                <br />
                <strong>
                  {lateCancelPlayerText(
                    lateCancel,
                    lateCancel.hours,
                    tenantName ?? 'este complejo',
                  )}
                </strong>
              </>
            )}
          </>
        }
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        variant="destructive"
        onConfirm={handleConfirm}
      >
        <div className="space-y-1">
          <label htmlFor="cancel-reason" className="text-sm font-medium text-foreground">
            Motivo (opcional)
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ej: no puedo ir, lluvia, equivocación de horario..."
            className="w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          />
        </div>
      </ConfirmDialog>
    </>
  )
}
