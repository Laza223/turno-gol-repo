import ReservaShell from '@/components/booking/ReservaDarkShell'
import { Skeleton } from '@/components/ui/skeleton'
import { PORTAL_COLUMN } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'

/**
 * Skeleton de la reserva confirmada: el mismo cascarón, la misma columna y el mismo ritmo que
 * `BookingSuccessCard` (badge y título centrados, el resumen, el botón de 48 px y la lista de
 * secundarias) para que al llegar los datos nada se mueva.
 */
export default function ReservaExitoLoading() {
  return (
    <ReservaShell>
      <div
        className={cn(PORTAL_COLUMN, 'pb-12 pt-6 sm:pt-12')}
        role="status"
        aria-label="Cargando…"
      >
        <div className="flex flex-col items-center">
          <Skeleton aria-hidden className="size-20 rounded-full" />
          <Skeleton aria-hidden className="mt-5 h-10 w-3/4" />
        </div>
        <div className="reserva-receipt-card mt-6 rounded-2xl p-5">
          <Skeleton aria-hidden className="h-7 w-2/3" />
          <Skeleton aria-hidden className="mt-1 h-5 w-1/2" />
          <div className="mt-4 space-y-3 border-t border-border pt-4 dark:border-white/10">
            <Skeleton aria-hidden className="h-6 w-3/4" />
            <Skeleton aria-hidden className="h-6 w-1/2" />
            <Skeleton aria-hidden className="h-6 w-2/3" />
          </div>
        </div>
        <Skeleton aria-hidden className="mt-8 h-12 w-full rounded-xl" />
        <Skeleton aria-hidden className="mt-8 h-[148px] w-full rounded-xl" />
      </div>
    </ReservaShell>
  )
}
