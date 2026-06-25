import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      {/* Banda dark (espeja PlayerHeroBand para no parpadear claro→oscuro) */}
      <div
        className="space-y-3 rounded-3xl border border-white/[.08] px-6 py-7"
        style={{ background: 'linear-gradient(135deg, #07131d 0%, #020617 58%)' }}
        aria-hidden
      >
        <div className="h-3 w-20 animate-pulse rounded bg-white/[.06]" />
        <div className="h-8 w-44 animate-pulse rounded-md bg-white/[.06]" />
        <div className="h-3.5 w-56 animate-pulse rounded-md bg-white/[.05]" />
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  )
}
