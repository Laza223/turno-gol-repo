import { Skeleton } from '@/components/ui/skeleton'

/** Silueta de CourtList: título plano + la tabla de canchas (una fila por cancha desde lg). */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-11 w-36 rounded-lg md:h-10" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="hidden border-b border-border px-4 py-3 lg:block">
          <Skeleton className="h-3 w-64" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="grid grid-cols-1 gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6 lg:py-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-16 shrink-0 rounded-md lg:h-10 lg:w-14" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-4 w-56" />
              <div className="flex items-center justify-between gap-3 lg:contents">
                <Skeleton className="h-5 w-40" />
                <div className="flex gap-1.5 lg:w-44 lg:justify-end">
                  <Skeleton className="h-10 w-20 rounded-md md:h-9" />
                  <Skeleton className="h-10 w-20 rounded-md md:h-9" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
