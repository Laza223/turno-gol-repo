import { cn } from '@/lib/utils'

function Block({ className }: { className: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />
}

/** Silueta de los cuatro números + las dos series. */
export function ActivityTopSkeleton() {
  return (
    <div className="space-y-3 lg:space-y-6" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-32" />
        ))}
      </div>
      <Block className="h-56" />
    </div>
  )
}

export function FeedSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:gap-6 lg:grid-cols-2" aria-hidden="true">
      <Block className="h-80" />
      <Block className="h-80" />
    </div>
  )
}

export function RestSkeleton() {
  return (
    <div className="space-y-3 lg:space-y-6" aria-hidden="true">
      <div className="grid grid-cols-1 gap-3 lg:gap-6 lg:grid-cols-2">
        <Block className="h-56" />
        <Block className="h-56" />
      </div>
      <Block className="h-64" />
      <Block className="h-14" />
    </div>
  )
}
