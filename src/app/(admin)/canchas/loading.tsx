import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-6 space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  )
}
