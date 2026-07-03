import Link from 'next/link'
import { Heart } from 'lucide-react'
import TenantCard from '@/app/(public)/explorar/components/TenantCard'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

/**
 * Lista de complejos favoritos del jugador. Reutiliza la TenantCard de
 * /explorar (carrusel, precio, rating, botón ❤️ con initialFavorited=true:
 * destogglear desde acá funciona igual que en explorar).
 */
export default function FavoritesList({
  tenants,
  photosByTenant,
}: {
  tenants: PublicTenantCard[]
  photosByTenant: Record<string, string[]>
}) {
  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-14 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-inset ring-rose-500/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20">
          <Heart className="h-8 w-8" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Sin favoritos todavía
          </h2>
          <p className="text-sm text-muted-foreground">
            Todavía no marcaste complejos favoritos. Tocá el corazón de un complejo para guardarlo
            acá.
          </p>
        </div>
        <Link
          href="/explorar"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Explorar complejos
        </Link>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-4">
      {tenants.map((t) => (
        <li key={t.id}>
          <TenantCard
            tenant={t}
            initialFavorited
            photos={photosByTenant[t.id] ?? []}
          />
        </li>
      ))}
    </ul>
  )
}
