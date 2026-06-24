import type { CityCount } from '@/modules/tenants/search.service'
import SearchBar from './SearchBar'
import PitchLines from './PitchLines'

/**
 * Banda hero clara de /explorar (firma "Matchday"): superficie emerald clara
 * con motivo de líneas de cal + titular en font-display, envolviendo el form
 * de búsqueda estructurada. NUNCA fondo oscuro (player-area §1).
 */
export default function SearchBand({ cities }: { cities: CityCount[] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-5 sm:p-7">
      <PitchLines
        variant="band"
        className="pointer-events-none absolute inset-0 h-full w-full text-emerald-600/10"
      />
      <div className="relative">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          ¿Dónde jugás hoy?
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Encontrá tu cancha ideal: filtrá por formato, superficie, servicios y precio.
        </p>
        <div className="mt-4">
          <SearchBar cities={cities} />
        </div>
      </div>
    </section>
  )
}
