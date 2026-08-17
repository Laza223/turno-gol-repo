import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de "Hoy" (dashboard/page.tsx): PageHeader, la grilla de tarjetas
 * de métrica —con la primera a ancho completo en mobile, igual que
 * `order-first col-span-2 lg:col-span-1`— y los dos bloques de abajo.
 *
 * Es de las que más se abre en frío: `getHoyData` dispara 12 servicios en una
 * sola transacción.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Skeleton className="order-first col-span-2 h-32 w-full lg:order-0 lg:col-span-1" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>

      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
