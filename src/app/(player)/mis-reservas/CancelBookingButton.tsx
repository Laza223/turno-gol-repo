'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { CancelReasonPicker } from '@/components/booking/CancelReasonPicker'
import { PLAYER_CANCEL_REASONS, type CancelReason } from '@/shared/cancel-reasons'
import { lateCancelPlayerText, type LateCancelPenalty } from '@/modules/bookings/late-cancel'
import { useRefundDialog } from './RefundDialogProvider'
import type { PlayerBookingActionResult } from './actions'

/** Firma de la Server Action que ejecuta la cancelación. */
export type CancelMyBookingAction = (
  bookingId: string,
  reasonCode: CancelReason,
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
  /** Nombre del complejo: identifica el turno y arma el aviso de bloqueo. */
  tenantName?: string
  /** Horas de anticipación que pide el complejo para devolver la seña. */
  policyHours?: number
  /** Turno de un fijo: cancelar alcanza solo a esta fecha. */
  isFixed?: boolean
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
function depositPreviewText(
  outcome: CancellationOutcome,
  amountCents: number,
  policyHours?: number,
): string {
  if (outcome === 'no_deposit') return 'No hay seña que devolver.'
  // La devolución la hace el complejo a mano: TurnoGol solo registra que corresponde.
  if (outcome === 'refund')
    return `El complejo te tiene que devolver la seña de ${formatArs(amountCents)}. Después de cancelar te mostramos cómo pedírsela.`
  return policyHours
    ? `El complejo se queda con la seña de ${formatArs(amountCents)} porque faltan menos de ${policyHours} h.`
    : `El complejo se queda con la seña de ${formatArs(amountCents)}.`
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
  policyHours,
  isFixed,
  describedBy,
  action,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<CancelReason | null>(null)
  // El diálogo de la devolución NO se renderiza acá: la Server Action revalida
  // /mis-reservas y esta tarjeta desaparece de "Próximos", con lo que React la
  // desmonta y se lleva puesto cualquier diálogo que fuera hijo suyo. Lo
  // muestra `RefundDialogProvider`, que está por encima de la lista.
  const showRefundDialog = useRefundDialog()

  async function handleConfirm() {
    if (!reason) return { success: false as const, error: 'Elegí por qué cancelás.' }
    let result: PlayerBookingActionResult
    try {
      result = await action(bookingId, reason)
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
        onClick={() => {
          setReason(null)
          setOpen(true)
        }}
        aria-describedby={describedBy}
        data-ghost
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-red-700 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:text-red-300"
      >
        Cancelar
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Cancelar este turno?"
        description={
          <>
            Turno en <strong>{courtName}</strong>
            {tenantName ? (
              <>
                {' '}
                de <strong>{tenantName}</strong>
              </>
            ) : null}
            , el <strong>{dateLabel}</strong>, de{' '}
            <strong className="tabular-nums">{timeLabel}</strong>.
            {isFixed && (
              <>
                <br />
                <br />
                Cancelás solo este turno. Tu turno fijo sigue las demás semanas.
              </>
            )}
            <br />
            <br />
            {depositPreviewText(cancellationOutcome, depositAmountCents, policyHours)}
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
        confirmLabel="Cancelar turno"
        cancelLabel="Volver"
        variant="destructive"
        onConfirm={handleConfirm}
      >
        <CancelReasonPicker
          reasons={PLAYER_CANCEL_REASONS}
          value={reason}
          onChange={setReason}
          legend="¿Por qué cancelás?"
        />
      </ConfirmDialog>
    </>
  )
}
