import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de "Hoy" (dashboard/page.tsx): PageHeader y los tres bloques
 * —próximos turnos, lo que necesita atención, lo que pasó sin el dueño—. Las
 * tarjetas de métrica salieron en el rediseño del 2026-09-10 (H010) y esta
 * silueta las siguió: un esqueleto que dibuja algo que ya no llega es peor que
 * ninguno, porque promete una pantalla distinta de la que aparece.
 *
 * Es de las que más se abre en frío: `getHoyData` dispara 11 servicios en una
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

      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
