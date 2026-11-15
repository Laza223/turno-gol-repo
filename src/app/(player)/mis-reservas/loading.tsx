import '@/components/world/portal-app.css'
import '@/components/booking/reserva.css'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de Mis reservas en vidrio, con el ritmo de la página: cabecera, control de pestañas y
 * tres tarjetas (la primera, la próxima, más alta) en la misma columna (`.pa-col`) que
 * `MisReservasView`.
 *
 * Las alturas son las MEDIDAS de la cabecera, el control y las tarjetas reales (la story
 * `AlturaDelEsqueleto` las compara). El texto y las acciones de la tarjeta saltan de línea según el
 * ancho del VIEWPORT, por eso los `min-[Npx]` (medidos en Chromium, paso de 4 px, con la próxima
 * trayendo dirección, "Cómo llegar", "Avisarle al grupo" y "Cancelar"). Si cambia la tarjeta o la
 * cabecera, se vuelven a medir.
 */
export default function MisReservasLoading() {
  return (
    <div className="portal-ambient min-h-[88vh]" role="status" aria-label="Cargando…">
      <div className="pa-col">
        <Skeleton aria-hidden variant="glass" data-sk="head" className="h-[104.5px] w-full" />
        <Skeleton
          aria-hidden
          variant="glass"
          data-sk="seg"
          className="mt-5 h-[54px] w-full rounded-full"
        />
        <div className="pa-list">
          <Skeleton
            aria-hidden
            variant="glass"
            data-sk="card"
            className="h-[416px] w-full rounded-[28px] min-[300px]:h-[392px] min-[324px]:h-[370px] min-[348px]:h-[339px] min-[368px]:h-[287px] min-[448px]:h-[272.5px] min-[520px]:h-[220.5px]"
          />
          <Skeleton
            aria-hidden
            variant="glass"
            data-sk="card"
            className="h-[273.5px] w-full rounded-[28px] min-[348px]:h-[220.5px]"
          />
          <Skeleton
            aria-hidden
            variant="glass"
            data-sk="card"
            className="h-[273.5px] w-full rounded-[28px] min-[348px]:h-[220.5px]"
          />
        </div>
      </div>
    </div>
  )
}
