import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      {/* Banda hero (misma silueta que SearchBand) */}
      <div className="player-hero-band rounded-3xl border px-5 py-7 sm:px-9 sm:py-9">
        <Skeleton className="h-7 w-56 rounded-full" />
        <Skeleton className="mt-4 h-10 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <Skeleton className="mt-6 h-20 w-full rounded-2xl" />
      </div>

      <div className="space-y-6">

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-48" />
        </div>

        <div className="lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-6">
          {/* Sidebar de filtros */}
          <Skeleton className="hidden h-[640px] rounded-2xl bg-card border border-border lg:block" />

        {/* Grilla de cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border border-t-2 border-t-emerald-500/40 bg-card shadow-xs">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-5 w-12" />
                </div>
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-5 w-24" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
