import HeroSearch from './HeroSearch'
import type { CityCount } from '@/modules/tenants/search.service'
import { HeroHeadline } from './HeroHeadline'
import { NearbyPanel } from './NearbyPanel'
import { NearbyProvider } from './nearby-context'

/**
 * Primer viewport de la home: el futbolero ve la cancha real que le queda cerca y sus
 * turnos libres de hoy, y busca por zona, día y hora.
 *
 * Un solo árbol para todos los anchos (nada de árboles hermanos gateados por CSS: duplicaban
 * el <h1> y pedían la ubicación dos veces). En el teléfono van titular → buscador → canchas;
 * desde `lg`, titular y buscador a la izquierda y las canchas a la derecha.
 */
export function Hero({ cities }: { cities: CityCount[] }) {
  return (
    <NearbyProvider>
      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pb-16 lg:pt-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
          <div className="min-w-0 space-y-5">
            <HeroHeadline />
            <HeroSearch cities={cities} />
          </div>
          <div className="min-w-0">
            <NearbyPanel cities={cities} />
          </div>
        </div>
      </section>
    </NearbyProvider>
  )
}
