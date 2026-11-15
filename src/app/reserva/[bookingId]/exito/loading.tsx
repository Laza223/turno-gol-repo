import ReservaShell from '@/components/booking/ReservaDarkShell'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de la reserva confirmada: el mismo cascarón, la misma columna y el mismo ritmo que
 * `BookingSuccessCard` (insignia y título centrados, el ticket, el botón y la fila de enlaces), en
 * vidrio con el brillo de carga, para que al llegar los datos nada se mueva.
 */
export default function ReservaExitoLoading() {
  return (
    <ReservaShell>
      <div className="grid justify-items-center pt-6 md:pt-10" role="status" aria-label="Cargando…">
        <Skeleton variant="glass" aria-hidden className="mb-[18px] size-[76px] rounded-full" />
        <Skeleton variant="glass" aria-hidden className="h-10 w-3/4 rounded-2xl" />
        <Skeleton variant="glass" aria-hidden className="mt-6 h-[420px] w-full rounded-[32px]" />
        <Skeleton variant="glass" aria-hidden className="mt-5 h-13 w-full rounded-full" />
        <Skeleton variant="glass" aria-hidden className="mt-4 h-11 w-4/5 rounded-full" />
      </div>
    </ReservaShell>
  )
}
