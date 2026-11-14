'use client'

import { useMemo, useState } from 'react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import TenantCard from './TenantCard'
import ExplorarMapLoader from './ExplorarMapLoader'

/**
 * Vista mapa = split lista + mapa. Compu: lista (scroll) a la izquierda + mapa sticky a la
 * derecha. Celu: el mapa arriba y la lista abajo; el botón "Lista" del encabezado vuelve.
 */
export default function ExplorarSplitView({
  results,
  favoritedIds,
}: {
  results: PublicTenantCard[]
  favoritedIds: string[]
}) {
  const favs = useMemo(() => new Set(favoritedIds), [favoritedIds])
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-4">
      <div className="order-2 space-y-3 lg:order-1 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
        {results.map((tn) => (
          <div
            key={tn.id}
            onMouseEnter={() => setActiveId(tn.id)}
            onMouseLeave={() => setActiveId(null)}
          >
            <TenantCard tenant={tn} initialFavorited={favs.has(tn.id)} variant="compact" />
          </div>
        ))}
      </div>
      <div className="order-1 mb-4 lg:order-2 lg:mb-0">
        <div className="lg:sticky lg:top-32">
          <ExplorarMapLoader results={results} activeId={activeId} />
        </div>
      </div>
    </div>
  )
}
