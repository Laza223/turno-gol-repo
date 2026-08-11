import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      {/* Banda theme-adaptive (misma receta que PlayerHeroBand — antes era un
          slab dark fijo que en light parpadeaba oscuro→claro) */}
      <div
        className="player-hero-band flex items-center gap-4 rounded-3xl border px-6 py-7"
        aria-hidden
      >
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-3.5 w-32 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  )
}
