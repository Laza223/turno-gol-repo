import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      {/* Heading */}
      <div className="space-y-1 px-1">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <div className="rounded-3xl border border-slate-200/80 bg-slate-50/95 p-4 shadow-sm backdrop-blur-sm sm:p-6 lg:p-8 space-y-6">
        {/* Barra de búsqueda */}
        <Skeleton className="h-20 w-full rounded-2xl" />

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-48" />
        </div>

        <div className="lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-6">
          {/* Sidebar de filtros */}
          <Skeleton className="hidden h-[640px] rounded-2xl bg-white border border-slate-200 lg:block" />

          {/* Grilla de cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Skeleton className="aspect-[16/9] w-full rounded-none" />
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
