import ReservaShell from '@/components/booking/ReservaDarkShell'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de la pantalla de confirmar: el mismo cascarón, la misma columna y los mismos bloques
 * que `page.tsx` (Volver, título, el resumen y el botón), en vidrio con el brillo de carga, para
 * que al cargar el contenido caiga en su lugar sin moverse.
 */
export default function ReservarLoading() {
  return (
    <ReservaShell className="rv-stack">
      <div aria-busy="true" className="rv-stack">
        {/* Volver */}
        <Skeleton variant="glass" aria-hidden className="h-11 w-24 rounded-full" />
        {/* Título */}
        <Skeleton variant="glass" aria-hidden className="h-7 w-3/5 rounded-xl" />
        {/* Resumen del turno */}
        <Skeleton variant="glass" aria-hidden className="h-[268px] w-full rounded-[32px]" />
        {/* Botón */}
        <Skeleton variant="glass" aria-hidden className="h-13 w-full rounded-full" />
        <Skeleton variant="glass" aria-hidden className="mx-auto h-4 w-4/5 rounded-lg" />
      </div>
    </ReservaShell>
  )
}
