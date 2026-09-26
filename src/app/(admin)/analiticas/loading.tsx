import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de `/analiticas` (analiticas/page.tsx): las flechas de mes (en
 * el teléfono; en escritorio viven en la barra), el bloque del mes con las
 * canchas y, abajo, por dónde entró y los últimos 30 días.
 *
 * El server abre dos transacciones (una por mes comparado) y, ya pintada, el
 * cliente pide `/api/admin/metrics` para los últimos 30 días.
 */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-11 w-56 lg:hidden" />

      <div className="card-premium space-y-4 p-4 sm:p-5">
        <div className="space-y-2 border-b border-border pb-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
