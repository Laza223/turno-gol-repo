import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true">
      {/* PageHeader: icon halo + título + subtítulo + CTA */}
      <div className="page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </div>

      {/* Píldoras de filtro */}
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Tabla: header + filas */}
      <div className="rounded-lg border bg-card divide-y divide-border">
        <div className="flex items-center gap-4 p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24 flex-1" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-20" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-36 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
