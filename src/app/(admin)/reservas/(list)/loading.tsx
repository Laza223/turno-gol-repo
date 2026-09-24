import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton con la silueta REAL de /reservas (MASTER §6.7 "Loading"): sin banda
 * de header (se fue con `PageHeader`), toolbar chica arriba (mobile) y la lista
 * del día — una sección con su fecha y filas separadas por filete, igual que
 * la página. Un esqueleto más gordo que el contenido real es un salto de
 * layout al cargar.
 */
export default function ReservasLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <Skeleton aria-hidden className="h-11 w-40 rounded-lg" />
        <Skeleton aria-hidden className="h-11 flex-1 rounded-lg" />
        <Skeleton aria-hidden className="h-11 w-24 rounded-lg" />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-3 py-2">
          <Skeleton aria-hidden className="h-4 w-40" />
        </div>
        <div className="flex flex-col gap-2 px-3 py-2">
          {Array.from({ length: 8 }).map((_, row) => (
            <Skeleton key={row} aria-hidden className="h-9 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
