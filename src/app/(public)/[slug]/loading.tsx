import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6" aria-busy="true">
      {/* Header skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-48 sm:h-56 w-full rounded-xl" />
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 rounded-lg flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>

      {/* Availability grid placeholder */}
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
