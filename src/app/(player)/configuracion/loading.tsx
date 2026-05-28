import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
