import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de `/analiticas` (analiticas/page.tsx): PageHeader "Métricas",
 * el tablero de actividad y, abajo, el reporte mensual con su navegación de mes.
 *
 * La más lenta del panel en frío: el server abre dos transacciones (una por
 * período comparado) y, ya pintada, el cliente pide `/api/admin/metrics`, que
 * son otras 7 consultas.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </div>

      {/* Tablero de actividad: 4 tarjetas + gráfico */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />

      {/* Reporte mensual: navegación de mes + tabla */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
