import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton con la silueta REAL de /reservas (MASTER §6.7 "Loading") tras el
 * rediseño: sin banda de header (se fue con `PageHeader`), toolbar chica
 * arriba (mobile) y 3 columnas de cancha — el mismo tablero de `CourtBoard`.
 */
export default function ReservasLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <Skeleton aria-hidden className="h-11 w-40 rounded-lg" />
        <Skeleton aria-hidden className="h-11 flex-1 rounded-lg" />
        <Skeleton aria-hidden className="h-11 w-24 rounded-lg" />
      </div>

      <div className="grid auto-cols-[85%] grid-flow-col gap-3 overflow-hidden pb-2 lg:auto-cols-[minmax(17.5rem,1fr)]">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="card-premium flex flex-col gap-2 rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton aria-hidden className="h-4 w-24" />
              <Skeleton aria-hidden className="h-4 w-6 rounded-full" />
            </div>
            {Array.from({ length: 4 }).map((_, row) => (
              <Skeleton key={row} aria-hidden className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
