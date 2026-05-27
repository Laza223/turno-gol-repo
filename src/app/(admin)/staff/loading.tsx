import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-3 flex gap-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="ml-auto h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
