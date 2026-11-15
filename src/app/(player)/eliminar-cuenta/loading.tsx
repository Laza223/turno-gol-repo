import { Skeleton } from '@/components/ui/skeleton'
import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'

/**
 * Esqueleto de Eliminar la cuenta en vidrio, con el ritmo de `EliminarCuentaView` SIN reservas por
 * jugar (el caso común; con reservas aparece además la nota naranja dentro del primer panel, que
 * el esqueleto no reserva): cabecera, aviso de irreversible, "Qué se borra", copia de datos y el
 * botón. El texto salta de línea según el ancho del VIEWPORT, de ahí los `min-[Npx]` (Chromium).
 * La story `AlturaDelEsqueleto` lo compara; si cambia un bloque, se vuelve a medir.
 */
export default function Loading() {
  return (
    <div className="portal-ambient min-h-[88vh]" role="status" aria-label="Cargando…">
      <div className="pa-col rv-stack gap-3.5">
        {/* Volver + título */}
        <div aria-hidden className="grid justify-items-start gap-1.5">
          <Skeleton variant="glass" className="h-11 w-40 rounded-full" />
          <Skeleton
            variant="glass"
            className="h-[calc(clamp(30px,2.4vw+20px,44px)*1.05)] w-64 max-w-full rounded-xl"
          />
        </div>
        {/* Aviso de irreversible */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[95px] w-full rounded-[20px] min-[376px]:h-[74px] min-[628px]:h-[52px]"
        />
        {/* Qué se borra y qué queda */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[307px] w-full rounded-[28px] min-[352px]:h-[281px] min-[390px]:h-[257px] min-[404px]:h-[233px] min-[448px]:h-[213px] min-[632px]:h-[189px] min-[690px]:h-[165px] md:h-[181px]"
        />
        {/* ¿Querés una copia de tus datos? */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[211px] w-full rounded-[28px] min-[432px]:h-[185px] min-[508px]:h-[165px] md:h-[181px]"
        />
        {/* Eliminar mi cuenta */}
        <Skeleton variant="glass" aria-hidden className="h-13 w-full rounded-full" />
      </div>
    </div>
  )
}
