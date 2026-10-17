import { Skeleton } from '@/components/ui/skeleton'
import { PORTAL_COLUMN } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'

/**
 * Esqueleto de Mis reservas con el ritmo de la lista: título, pestañas y tres tarjetas (la
 * primera, la próxima, más alta) en la misma columna que `MisReservasView`.
 *
 * Las alturas son las MEDIDAS de las tarjetas reales (la story `AlturaDelEsqueleto` las compara):
 * la próxima mide 339 px a 320, 307 hasta ~470 px de ancho (las acciones bajan de renglón) y 255 px
 * desde ahí; una compacta, 231 px. Si cambia la tarjeta, se vuelven a medir.
 */
export default function MisReservasLoading() {
  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6')} role="status" aria-label="Cargando…">
      <Skeleton aria-hidden className="h-9 w-48" />
      <Skeleton aria-hidden className="mt-3 h-5 w-40" />
      <Skeleton aria-hidden className="mt-6 h-11 w-full rounded-xl" />
      <div className="mt-6 space-y-3">
        <Skeleton
          aria-hidden
          className="h-[339px] w-full rounded-xl min-[350px]:h-[307px] min-[470px]:h-[255px]"
        />
        <Skeleton aria-hidden className="h-[231px] w-full rounded-xl" />
        <Skeleton aria-hidden className="h-[231px] w-full rounded-xl" />
      </div>
    </div>
  )
}
