import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton con la silueta REAL de la Agenda (`/reservas`, MASTER §6.7
 * "Loading"): sin banda de header (se fue con `PageHeader`), buscador +
 * chips chicos arriba (mobile) y una sola lista con dos grupos de día —
 * encabezado + filas separadas por filete, igual que la página real. Un
 * esqueleto más gordo que el contenido real es un salto de layout al cargar.
 */
export default function ReservasLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 lg:hidden">
        <Skeleton aria-hidden className="h-11 w-full rounded-lg" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton aria-hidden className="h-8 w-24 rounded-full" />
          <Skeleton aria-hidden className="h-8 w-16 rounded-full" />
          <Skeleton aria-hidden className="h-8 w-28 rounded-full" />
        </div>
      </div>
      <div className="hidden items-center gap-1.5 lg:flex">
        <Skeleton aria-hidden className="h-8 w-16 rounded-full" />
        <Skeleton aria-hidden className="h-8 w-32 rounded-full" />
        <Skeleton aria-hidden className="h-8 w-24 rounded-full" />
        <Skeleton aria-hidden className="h-8 w-24 rounded-full" />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-xs">
        {Array.from({ length: 2 }).map((_, group) => (
          <div key={group}>
            <div className="border-b border-border px-3 py-2">
              <Skeleton aria-hidden className="h-4 w-40" />
            </div>
            <div className="flex flex-col gap-2 px-3 py-2">
              {Array.from({ length: 4 }).map((_, row) => (
                <Skeleton key={row} aria-hidden className="h-9 w-full rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
