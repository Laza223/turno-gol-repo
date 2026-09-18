import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton con la silueta REAL de /reservas (MASTER §6.7 "Loading") tras el
 * rediseño: sin banda de header (se fue con `PageHeader`), toolbar chica
 * arriba (mobile) y 3 columnas de cancha — el mismo tablero de `CourtBoard`.
 */
export default function ReservasLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <Skeleton aria-hidden className="h-11 w-40 rounded-lg" />
        <Skeleton aria-hidden className="h-11 flex-1 rounded-lg" />
        <Skeleton aria-hidden className="h-11 w-24 rounded-lg" />
      </div>

      {/* Misma silueta que `CourtBoard` después del rediseño de densidad: la
          columna es un borde de 1px (no `card-premium`) y cada turno mide 52px,
          no 121. Un esqueleto más gordo que el contenido real es un salto de
          layout al cargar. Tres columnas es el caso más común; el reparto por
          cantidad de canchas no se conoce todavía acá. */}
      <div className="grid auto-cols-[85%] grid-flow-col gap-3 overflow-hidden pb-2 lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="flex flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <Skeleton aria-hidden className="h-4 w-24" />
              <Skeleton aria-hidden className="h-4 w-6 rounded-full" />
            </div>
            <div className="flex flex-col gap-2 px-3 py-2">
              {Array.from({ length: 6 }).map((_, row) => (
                <Skeleton key={row} aria-hidden className="h-9 w-full rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
