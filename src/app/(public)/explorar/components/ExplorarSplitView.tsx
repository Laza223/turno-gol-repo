'use client'

import { useState } from 'react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import TenantCard from './TenantCard'
import ExplorarMapLoader from './ExplorarMapLoader'

/**
 * Vista mapa = split lista + mapa. Desktop: lista (scroll) izquierda + mapa
 * sticky derecha. Mobile: el toggle Lista/Mapa del Toolbar decide; acá se
 * muestra el mapa full-width con la lista colapsada arriba.
 */
export default function ExplorarSplitView({
  results,
  favoritedIds,
  photosByTenant: _photosByTenant,
}: {
  results: PublicTenantCard[]
  favoritedIds: string[]
  photosByTenant: Record<string, string[]>
}) {
  const favs = new Set(favoritedIds)
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-4">
      <div className="order-2 max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-1 lg:order-1">
        {results.map((tn) => (
          <div key={tn.id} onMouseEnter={() => setActiveId(tn.id)} onMouseLeave={() => setActiveId(null)}>
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
