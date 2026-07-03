import { Skeleton } from '@/components/ui/skeleton'

// Silueta real del contenido (§5.3): header band, 3 KPIs, cantina, tabla.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Skeleton className="order-first col-span-2 h-32 w-full lg:order-none lg:col-span-1" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
