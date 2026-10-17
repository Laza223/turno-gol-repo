import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RESERVAR_COLUMN } from './CheckoutStates'

/**
 * Skeleton de la pantalla de confirmar, plano: la misma columna, los mismos bloques y las mismas
 * separaciones que `page.tsx` (32 px entre bloques, 12 bajo el título de sección, 8 hasta la regla
 * de cancelación y 48 al pie), para que al cargar el contenido caiga en su lugar sin moverse.
 * Modela el caso común: tarjeta del turno, dos formas de pago y el botón.
 */
export default function ReservarLoading() {
  return (
    <div className={cn(RESERVAR_COLUMN, 'pb-12')} aria-busy="true">
      {/* Volver */}
      <Skeleton aria-hidden className="h-11 w-20" />
      {/* Título */}
      <Skeleton aria-hidden className="mt-2 h-9 w-3/4" />
      <div className="mt-6 space-y-8">
        {/* Resumen (misma silueta que BookingSummary) */}
        <div className="rounded-xl border border-border bg-card p-4">
          <Skeleton aria-hidden className="h-7 w-2/3" />
          <Skeleton aria-hidden className="mt-1 h-5 w-1/2" />
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <Skeleton aria-hidden className="h-6 w-3/4" />
            <Skeleton aria-hidden className="h-6 w-1/2" />
            <Skeleton aria-hidden className="h-6 w-2/3" />
          </div>
        </div>
        {/* Cómo pagás: título, las dos opciones y la regla de cancelación */}
        <div>
          <Skeleton aria-hidden className="mb-3 h-7 w-48" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* 70 px en una columna; desde `sm`, de a dos, y el "hint" se parte en dos líneas: 90 px. */}
            <Skeleton aria-hidden className="h-[70px] rounded-xl sm:h-[90px]" />
            <Skeleton aria-hidden className="h-[70px] rounded-xl sm:h-[90px]" />
          </div>
          <Skeleton aria-hidden className="mt-2 h-5 w-2/3" />
        </div>
        {/* Confirmar */}
        <Skeleton aria-hidden className="h-[52px] w-full rounded-xl" />
      </div>
    </div>
  )
}
