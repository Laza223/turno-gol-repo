import { Skeleton } from '@/components/ui/skeleton'
import { PORTAL_COLUMN } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'

/**
 * Skeleton de la reserva confirmada, plano: la misma columna y el mismo ritmo que
 * `BookingSuccessCard` (ícono y título, el resumen con su borde, el botón de 48 px y la lista de
 * secundarias) para que al llegar los datos nada se mueva.
 */
export default function ReservaExitoLoading() {
  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6 sm:pt-12')} role="status" aria-label="Cargando…">
      <Skeleton aria-hidden className="size-8 rounded-full" />
      <Skeleton aria-hidden className="mt-4 h-9 w-3/4" />
      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <Skeleton aria-hidden className="h-7 w-2/3" />
        <Skeleton aria-hidden className="mt-1 h-5 w-1/2" />
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Skeleton aria-hidden className="h-6 w-3/4" />
          <Skeleton aria-hidden className="h-6 w-1/2" />
          <Skeleton aria-hidden className="h-6 w-2/3" />
        </div>
      </div>
      <Skeleton aria-hidden className="mt-8 h-12 w-full rounded-xl" />
      <Skeleton aria-hidden className="mt-8 h-[148px] w-full rounded-xl" />
    </div>
  )
}
