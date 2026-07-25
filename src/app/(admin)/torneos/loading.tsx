import { Skeleton } from '@/components/ui/skeleton'

/**
 * Espeja el layout de torneos/page.tsx: PageHeader + lista de tarjetas de
 * torneo (no es una tabla, a diferencia de abonados).
 */
export default function Loading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true">
      {/* PageHeader: icon halo + título + subtítulo + CTA */}
      <div className="page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>

      {/* Tarjetas de torneo: nombre + formato/fechas a la izquierda, badge de estado a la derecha */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-60" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
