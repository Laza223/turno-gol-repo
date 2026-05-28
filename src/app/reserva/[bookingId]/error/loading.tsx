import { Skeleton } from '@/components/ui/skeleton'

export default function ReservaErrorLoading() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12">
      <Skeleton className="mb-5 h-16 w-16 rounded-full" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-3 h-4 w-56" />
      <Skeleton className="mt-2 h-4 w-40" />
    </div>
  )
}
