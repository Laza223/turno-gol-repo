'use client'

import dynamic from 'next/dynamic'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

// Leaflet toca window: solo en cliente (ssr:false). Solo se puede declarar así
// dentro de un Client Component.
const ExplorarMap = dynamic(() => import('./ExplorarMap'), {
  ssr: false,
  loading: () => (
    <div
      className="h-[70vh] w-full animate-pulse rounded-2xl border border-border bg-muted"
      aria-busy="true"
      aria-label="Cargando mapa"
    />
  ),
})

export default function ExplorarMapLoader({
  results,
  activeId = null,
}: {
  results: PublicTenantCard[]
  activeId?: string | null
}) {
  return <ExplorarMap results={results} activeId={activeId} />
}
