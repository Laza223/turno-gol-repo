import { Skeleton } from '@/components/ui/skeleton'
import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'

/**
 * Esqueleto de Mi cuenta en vidrio, con el ritmo de la página entera: cabecera, "Quién sos",
 * las tres tarjetas de actividad y los cinco paneles (datos, favoritos, tema, datos personales,
 * baja), cada uno con las alturas MEDIDAS de `ConfiguracionView` (dos favoritos, con partidos).
 * Los `min-[Npx]` son los anchos de VIEWPORT donde el texto real salta de línea (Chromium). La
 * story `AlturaDelEsqueleto` lo compara con la vista real: si cambia un panel, se vuelve a medir.
 */
export default function Loading() {
  return (
    <div className="portal-ambient min-h-[88vh]" role="status" aria-label="Cargando…">
      <div className="pa-col rv-stack gap-3.5">
        {/* Cabecera: eyebrow + título */}
        <div aria-hidden className="grid gap-1.5">
          <div className="flex h-[21px] items-center">
            <Skeleton variant="glass" className="h-3.5 w-24 rounded-lg" />
          </div>
          <Skeleton
            variant="glass"
            className="h-[calc(clamp(30px,2.4vw+20px,44px)*1.05)] w-48 rounded-xl"
          />
        </div>
        {/* Quién sos */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[154px] w-full rounded-[32px] min-[355px]:h-[134px] min-[370px]:h-[111px]"
        />
        {/* Tu actividad */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[332px] w-full rounded-3xl min-[330px]:h-[252px] min-[380px]:h-[231px] min-[480px]:h-[150px] min-[570px]:h-[130px]"
        />
        {/* Tus datos */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[606px] w-full rounded-[28px] min-[370px]:h-[585px] min-[500px]:h-[565px] min-[640px]:max-[767px]:h-[371px] md:h-[387px]"
        />
        {/* Favoritos */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[240px] w-full rounded-[28px] md:h-[256px]"
        />
        {/* Tema */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[134px] w-full rounded-[28px] md:h-[150px]"
        />
        {/* Tus datos personales */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[290px] w-full rounded-[28px] min-[340px]:h-[266px] min-[380px]:h-[246px] min-[425px]:h-[223px] md:max-[799px]:h-[239px] min-[800px]:h-[216px]"
        />
        {/* Salir o darte de baja */}
        <Skeleton
          variant="glass"
          aria-hidden
          className="h-[229px] w-full rounded-[28px] min-[350px]:h-[177px] min-[425px]:h-[157px] md:h-[173px]"
        />
      </div>
    </div>
  )
}
