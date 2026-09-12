import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de "Hoy" (dashboard/page.tsx): la línea de lo que necesita
 * atención arriba, el tablero de próximos turnos y el registro plegado. La
 * banda `PageHeader` salió en el rediseño del 2026-09-12 (el título y la fecha
 * viven en la barra superior del panel) y esta silueta la siguió: un esqueleto
 * que dibuja algo que ya no llega es peor que ninguno, porque promete una
 * pantalla distinta de la que aparece.
 *
 * Es de las que más se abre en frío: `getHoyData` dispara 11 servicios en una
 * sola transacción.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-14 w-full rounded-2xl" />
    </div>
  )
}
