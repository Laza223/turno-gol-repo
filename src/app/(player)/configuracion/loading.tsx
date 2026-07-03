import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      {/* Banda theme-adaptive (misma receta que PlayerHeroBand — antes era un
          slab dark fijo que en light parpadeaba oscuro→claro) */}
      <div className="player-hero-band space-y-3 rounded-3xl border px-6 py-7" aria-hidden>
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-8 w-44 rounded-md" />
        <Skeleton className="h-3.5 w-56 rounded-md" />
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  )
}
