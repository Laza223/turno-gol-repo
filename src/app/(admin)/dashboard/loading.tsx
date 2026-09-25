import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silueta real de "Hoy" (dashboard/page.tsx): el tablero de turnos arriba y el
 * registro plegado — y, desde `xl`, la columna de venta a la derecha. La banda
 * `PageHeader` salió en el rediseño del 2026-09-12 (el título y la fecha viven en
 * la barra superior del panel) y la línea de "Nada pendiente" en el pulido del
 * 2026-09-24 (sin alertas no se dibuja nada). Esta silueta las siguió: un
 * esqueleto que dibuja algo que ya no llega es peor
 * que ninguno, porque promete una pantalla distinta de la que aparece.
 *
 * La columna se oculta por debajo de `xl`, igual que la real (ahí la venta es
 * un botón de la barra superior): en el teléfono no hay nada que reservarle.
 *
 * Es de las que más se abre en frío: `getHoyData` dispara varios servicios en
 * una sola transacción.
 */
export default function Loading() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start" aria-busy="true">
      <div className="min-w-0 space-y-4">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
      <Skeleton className="hidden h-[30rem] w-full rounded-2xl xl:block" />
    </div>
  )
}
