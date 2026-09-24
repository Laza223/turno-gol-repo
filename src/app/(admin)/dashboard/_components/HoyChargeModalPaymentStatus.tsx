import Link from 'next/link'
import { CheckCircle2, Trophy } from 'lucide-react'
import type { ChargeLine } from '@/components/admin/SplitPaymentFields'
import { CobrarSenaButton, type ConfirmDepositFn } from '@/components/booking/CobrarSenaButton'
import type { ChargeMode } from '@/components/booking/slot-panel/charge-copy'
import type { MethodKey } from '@/lib/payment-method'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { HoyChargeSection } from './HoyChargeSection'
import type { ChargeBooking } from './HoyChargeModal'

const ACTION_BUTTON =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60 md:h-10'

/**
 * Qué se muestra en el lugar del cobro: el formulario (`mode`), "Cobrado ✓"
 * (`settled`), "Cobrar seña $X" (`canConfirmDeposit`) o nada — más el aviso de
 * torneo, que convive con cualquiera de los tres. Extraído de `HoyChargeModal`.
 */
export function HoyChargeModalPaymentStatus({
  booking,
  mode,
  capacity,
  lines,
  onLinesChange,
  error,
  isPending,
  locked,
  onSubmit,
  onPartialCharge,
  onTeamCharge,
  retryTotal,
  onRetry,
  settled,
  onClose,
  canConfirmDeposit,
  confirmDepositPaymentAction,
  onMutated,
  isTournament,
}: {
  booking: ChargeBooking
  mode: ChargeMode
  capacity: number | undefined
  lines: ChargeLine[]
  onLinesChange: (lines: ChargeLine[]) => void
  error: string | null
  isPending: boolean
  locked: boolean
  onSubmit: () => void
  onPartialCharge: (amountCents: number, method: MethodKey) => void
  onTeamCharge: (teamLines: ChargeLine[]) => void
  retryTotal: number | null
  onRetry: () => void
  /** Un ausente nunca "Cobrado ✓": ver comentario homólogo en `HoyChargeModal`. */
  settled: boolean
  onClose: () => void
  canConfirmDeposit: boolean
  confirmDepositPaymentAction: ConfirmDepositFn | undefined
  onMutated: () => void
  isTournament: boolean
}) {
  return (
    <>
      {mode ? (
        <HoyChargeSection
          booking={booking}
          mode={mode}
          capacity={capacity}
          lines={lines}
          onLinesChange={onLinesChange}
          error={error}
          isPending={isPending}
          locked={locked}
          onSubmit={onSubmit}
          onPartialCharge={onPartialCharge}
          onTeamCharge={onTeamCharge}
          retryTotal={retryTotal}
          onRetry={onRetry}
        />
      ) : settled ? (
        <>
          <p
            role="status"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold',
              TONE_BADGE.success,
            )}
          >
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            Cobrado ✓
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Listo
          </button>
        </>
      ) : canConfirmDeposit ? (
        <CobrarSenaButton
          bookingId={booking.id}
          depositAmount={booking.depositAmount ?? 0}
          confirmDepositPaymentAction={confirmDepositPaymentAction!}
          onSuccess={onMutated}
          disabled={locked}
          className="w-full"
        />
      ) : null}

      {isTournament && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Esta hora la ocupa un torneo. La plata del torneo entra por la inscripción, no por turno
            — se gestiona desde la pantalla del torneo.
          </p>
          {booking.tournamentId && (
            <Link
              href={`/torneos/${booking.tournamentId}`}
              className={cn(
                ACTION_BUTTON,
                'flex-none border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              <Trophy aria-hidden className="h-4 w-4" />
              Ir al torneo
            </Link>
          )}
        </>
      )}
    </>
  )
}
