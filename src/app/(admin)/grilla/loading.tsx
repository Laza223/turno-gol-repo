import { Skeleton } from '@/components/ui/skeleton'

export default function GrillaLoading() {
  return (
    <main className="max-w-full px-4 py-8 space-y-6">
      {/* Header block: title + date line */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Faux table: header row + 6 data rows across 3 columns */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-4 border-b border-border bg-muted p-2 gap-2">
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-4 border-b border-border last:border-0 p-2 gap-2"
          >
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </main>
  )
}
