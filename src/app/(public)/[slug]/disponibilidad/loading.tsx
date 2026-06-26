import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 space-y-6" aria-busy="true">
      {/* Back link */}
      <Skeleton className="h-4 w-32" />

      {/* Heading */}
      <Skeleton className="h-7 w-64" />

      {/* Week table */}
      <div className="space-y-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: 8 }).map((_, j) => (
                <Skeleton key={j} className="h-8 w-20 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
