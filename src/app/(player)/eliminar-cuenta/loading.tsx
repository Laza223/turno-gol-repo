import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de Eliminar la cuenta en la misma columna que la vista: link de vuelta, título y las
 * tarjetas de aviso, con las alturas MEDIDAS de `EliminarCuentaView` SIN reservas por jugar (el caso
 * común; con reservas aparece además la tarjeta naranja, que el esqueleto no reserva). El texto salta
 * de línea según el ancho del VIEWPORT, de ahí los `min-[Npx]` (Chromium, paso de 1 px). La story
 * `AlturaDelEsqueleto` lo compara; si cambia una tarjeta, se vuelve a medir.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6" role="status" aria-label="Cargando…">
      <div>
        <Skeleton aria-hidden className="h-11 w-40" />
        <Skeleton aria-hidden className="mt-1 h-8 w-64 max-w-full" />
      </div>
      <Skeleton aria-hidden className="h-[94px] w-full rounded-2xl min-[387px]:h-[74px]" />
      <Skeleton
        aria-hidden
        className="h-[278px] w-full rounded-2xl min-[394px]:h-[254px] min-[408px]:h-[230px] min-[455px]:h-[210px]"
      />
      <Skeleton
        aria-hidden
        className="h-[222px] w-full rounded-2xl min-[346px]:h-[198px] min-[363px]:h-[174px]"
      />
      <Skeleton aria-hidden className="h-12 w-full rounded-xl" />
    </div>
  )
}
