import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de Mis reservas con el ritmo de la página: la banda hero, las pestañas en píldora y
 * tres tarjetas (la primera, la próxima, más alta) en la misma columna que `MisReservasView`.
 *
 * Las alturas son las MEDIDAS de la banda y de las tarjetas reales (la story `AlturaDelEsqueleto`
 * las compara). Si cambia la tarjeta, se vuelven a medir.
 */
export default function MisReservasLoading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6" role="status" aria-label="Cargando…">
      <Skeleton aria-hidden className="h-[153px] w-full rounded-3xl" />
      <Skeleton aria-hidden className="h-[52px] w-full rounded-full" />
      <div className="space-y-3">
        <Skeleton
          aria-hidden
          className="h-[339px] w-full rounded-2xl min-[350px]:h-[307px] min-[470px]:h-[255px]"
        />
        <Skeleton aria-hidden className="h-[231px] w-full rounded-2xl" />
        <Skeleton aria-hidden className="h-[231px] w-full rounded-2xl" />
      </div>
    </div>
  )
}
