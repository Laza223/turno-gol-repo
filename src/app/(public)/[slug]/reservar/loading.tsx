import { Skeleton } from '@/components/ui/skeleton'

export default function ReservarLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:px-6 space-y-5">
      <Skeleton className="h-7 w-48" />
      {/* Summary card */}
      <div className="space-y-3 rounded-xl border border-slate-200 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      {/* Button */}
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  )
}
