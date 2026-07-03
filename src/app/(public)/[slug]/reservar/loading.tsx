import { Skeleton } from '@/components/ui/skeleton'
import ReservaShell from '@/components/booking/ReservaDarkShell'

export default function ReservarLoading() {
  return (
    <ReservaShell>
      <div className="mx-auto max-w-md space-y-5 px-4 py-10 sm:px-6" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        {/* Resumen (misma silueta que BookingSummary) */}
        <div className="reserva-receipt-card space-y-4 rounded-2xl p-5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-7 w-1/3" />
        </div>
        {/* Método de pago + CTA */}
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-[58px] w-full rounded-xl" />
      </div>
    </ReservaShell>
  )
}
