'use client'

import { Suspense, lazy } from 'react'

// React.lazy + Suspense: recharts (~100kB+ gz) se importa SOLO dentro de
// MetricsDashboard, así queda en un chunk async y nunca entra al shared bundle.
const MetricsDashboard = lazy(() => import('./MetricsDashboard'))

function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando métricas">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-lg border border-border bg-muted lg:col-span-2" />
        <div className="h-80 animate-pulse rounded-lg border border-border bg-muted" />
      </div>
      <div className="h-80 animate-pulse rounded-lg border border-border bg-muted" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-lg border border-border bg-muted" />
        <div className="h-56 animate-pulse rounded-lg border border-border bg-muted" />
      </div>
    </div>
  )
}

export function MetricsDashboardLoader({ canSeeSystem }: { canSeeSystem: boolean }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <MetricsDashboard canSeeSystem={canSeeSystem} />
    </Suspense>
  )
}
