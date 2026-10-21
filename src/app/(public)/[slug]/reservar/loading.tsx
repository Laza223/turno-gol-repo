import ReservaShell from '@/components/booking/ReservaDarkShell'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RESERVAR_COLUMN } from './CheckoutStates'

/**
 * Skeleton de la pantalla de confirmar: el mismo cascarón, la misma columna y los mismos bloques
 * que `page.tsx` (32 px entre bloques y 48 al pie), para que al cargar el contenido caiga en su
 * lugar sin moverse. Modela el caso común: la tarjeta del turno, el botón y la regla de cancelación.
 */
export default function ReservarLoading() {
  return (
    <ReservaShell>
      <div className={cn(RESERVAR_COLUMN, 'pb-12')} aria-busy="true">
        {/* Volver */}
        <Skeleton aria-hidden className="h-11 w-20" />
        {/* Título */}
        <Skeleton aria-hidden className="mt-2 h-9 w-3/4" />
        <div className="mt-6 space-y-8">
          {/* Resumen (misma silueta que BookingSummary) */}
          <div className="reserva-receipt-card rounded-2xl p-5">
            <Skeleton aria-hidden className="h-7 w-2/3" />
            <Skeleton aria-hidden className="mt-1 h-5 w-1/2" />
            <div className="mt-4 space-y-3 border-t border-border pt-4 dark:border-white/10">
              <Skeleton aria-hidden className="h-6 w-3/4" />
              <Skeleton aria-hidden className="h-6 w-1/2" />
              <Skeleton aria-hidden className="h-6 w-2/3" />
            </div>
          </div>
          {/* Reservar y la regla de cancelación */}
          <div>
            <Skeleton aria-hidden className="h-[52px] w-full rounded-xl" />
            <Skeleton aria-hidden className="mt-2 h-5 w-2/3" />
          </div>
        </div>
      </div>
    </ReservaShell>
  )
}
