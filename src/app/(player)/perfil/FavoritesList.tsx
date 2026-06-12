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
      <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
        <Heart className="h-10 w-10" aria-hidden />
        <p className="text-sm text-center">
          Todavía no marcaste complejos favoritos.
          <br />
          Tocá el corazón de un complejo para guardarlo acá.
        </p>
        <Link
          href="/explorar"
          className="mt-2 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
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
