import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de Mis reservas con el ritmo de la página: la banda hero, las pestañas en píldora y
 * tres tarjetas (la primera, la próxima, más alta) en la misma columna que `MisReservasView`.
 *
 * Las alturas son las MEDIDAS de la banda y de las tarjetas reales (la story `AlturaDelEsqueleto`
 * las compara). Las tarjetas llevan el bloque-fecha `w-14` + `gap-4`, que le resta 72 px al texto:
 * el texto salta de línea según el ancho del VIEWPORT, por eso los `min-[Npx]` (medidos en Chromium,
 * paso de 2 px). Si cambia la tarjeta o la banda, se vuelven a medir.
 */
export default function MisReservasLoading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6" role="status" aria-label="Cargando…">
      <Skeleton aria-hidden className="h-[143px] w-full rounded-3xl min-[520px]:h-[149px]" />
      <Skeleton aria-hidden className="h-[54px] w-full rounded-full" />
      <div className="space-y-3">
        <Skeleton
          aria-hidden
          className="h-[358px] w-full rounded-2xl min-[364px]:h-[338px] min-[418px]:h-[307px] min-[472px]:h-[255px]"
        />
        <Skeleton
          aria-hidden
          className="h-[282px] w-full rounded-2xl min-[377px]:h-[251px] min-[396px]:h-[231px]"
        />
        <Skeleton
          aria-hidden
          className="h-[282px] w-full rounded-2xl min-[377px]:h-[251px] min-[396px]:h-[231px]"
        />
      </div>
    </div>
  )
}
