import HeroSearch from './HeroSearch'
import PitchLines from '@/components/public/PitchLines'
import type { CityCount } from '@/modules/tenants/search.service'
import { HeroHeadline } from './HeroHeadline'
import { NearbyPanel } from './NearbyPanel'
import { NearbyProvider } from './nearby-context'

/**
 * Hero de la home: el futbolero ve la cancha real que le queda cerca y sus
 * turnos libres de hoy, y si no le sirve, busca por zona, día y hora.
 *
 * Un solo árbol para todos los anchos (nada de árboles hermanos gateados por
 * CSS: duplicaban el <h1> y pedían la ubicación dos veces). El orden cambia
 * solo con CSS: en el teléfono va titular → cancha → buscador; desde `lg`, el
 * titular y el buscador a la izquierda, centrados contra la cancha de la derecha
 * (las filas 1fr de arriba y abajo los centran).
 */
export function Hero({ cities }: { cities: CityCount[] }) {
  return (
    <NearbyProvider>
      <section className="relative overflow-hidden px-4 pb-14 pt-[104px] sm:px-6 sm:pt-[124px] lg:flex lg:min-h-[100svh] lg:items-center lg:pb-16 lg:pt-[140px]">
        <div
          aria-hidden
          className="hero-glow-blob pointer-events-none absolute left-[-14%] top-[-12%] z-0 h-[620px] w-[620px] rounded-full opacity-70"
        />
        <div
          aria-hidden
          className="hero-glow-blob pointer-events-none absolute bottom-[-18%] right-[-10%] z-0 h-[760px] w-[760px] rounded-full opacity-60"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-[-10%] z-0 h-[70%] text-emerald-600/[.14] dark:text-white/[.035]"
        >
          <div className="mx-auto h-full max-w-[1400px]">
            <PitchLines className="h-full w-full" />
          </div>
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-7 lg:grid-cols-[minmax(0,0.74fr)_minmax(0,1fr)] lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-[60px] lg:gap-y-0">
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <HeroHeadline />
          </div>
          <div className="order-3 min-w-0 lg:order-none lg:col-start-1 lg:row-start-3 lg:mt-7">
            <HeroSearch cities={cities} />
          </div>
          <div className="order-2 min-w-0 lg:order-none lg:col-start-2 lg:row-span-4 lg:row-start-1">
            <NearbyPanel cities={cities} />
          </div>
        </div>
      </section>
    </NearbyProvider>
  )
}
