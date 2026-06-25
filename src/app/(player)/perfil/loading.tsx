import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      {/* Banda dark (espeja PlayerHeroBand para no parpadear claro→oscuro) */}
      <div
        className="flex items-center gap-4 rounded-3xl border border-white/[.08] px-6 py-7"
        style={{ background: 'linear-gradient(135deg, #07131d 0%, #020617 58%)' }}
        aria-hidden
      >
        <div className="h-16 w-16 animate-pulse rounded-full bg-white/[.06]" />
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded-md bg-white/[.06]" />
          <div className="h-3.5 w-32 animate-pulse rounded-md bg-white/[.05]" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  )
}
