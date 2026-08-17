import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de "Personas" (JugadoresView.tsx): PageHeader, tabs, buscador y
 * la lista. Va con el `p-6` propio de esa vista, que no usa el espaciado del
 * resto del panel.
 *
 * Es la vista con la consulta más cara del panel (`listTenantClients` cruza
 * jugadores registrados con contactos derivados de turnos fijos), así que este
 * boundary es el que más se nota.
 */
export default function Loading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true">
      <div className="page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <Skeleton className="h-7 w-32" />
        </div>
      </div>

      {/* ClientesTabs */}
      <div className="flex gap-1 border-b border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-none" />
        ))}
      </div>

      {/* Buscador */}
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />

      {/* Lista */}
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
