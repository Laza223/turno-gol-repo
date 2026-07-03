import type { CityCount } from '@/modules/tenants/search.service'
import PitchLines from '@/components/public/PitchLines'
import SearchBar from './SearchBar'

/**
 * Banda hero de /explorar — identidad "Matchday" theme-adaptive (MASTER §4.3 +
 * pages/explorar.md reinterpretado): light = banda clara crema/emerald con
 * líneas de cal (mediodía de partido); dark = slab nocturno con la misma
 * cancha en white-alpha. Receta `.player-hero-band` (compartida con el resto
 * del portal del jugador).
 */
export default function SearchBand({ cities }: { cities: CityCount[] }) {
  return (
    <section className="player-hero-band relative isolate z-30 overflow-hidden rounded-3xl border px-5 py-7 sm:px-9 sm:py-9">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        {/* Líneas de cal — la firma de la vista */}
        <div className="absolute inset-y-0 right-[-8%] w-[72%] text-emerald-600/[.16] dark:text-white/[.05]">
          <PitchLines className="h-full w-full" />
        </div>
        {/* Glow nocturno (solo dark) */}
        <div
          aria-hidden
          className="hero-glow-blob absolute right-[-10%] top-[-70%] hidden h-[480px] w-[480px] rounded-full blur-[12px] dark:block"
        />
      </div>

      <div className="mb-6 max-w-2xl">
        <div className="live-pill inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 font-logo text-[12px] font-bold uppercase tracking-[.1em]">
          <span aria-hidden className="inline-flex h-[8px] w-[8px] rounded-full bg-emerald-500 dark:bg-emerald-400" />
          Disponibilidad en tiempo real
        </div>
        <h1
          className="mt-[14px] font-display font-black italic text-foreground"
          style={{ fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: '1', letterSpacing: '-0.03em' }}
        >
          Encontrá tu cancha <span className="hero-accent-text">ideal</span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Filtrá por formato, superficie, servicios y precio. Consultá disponibilidad en tiempo real y reservá al instante.
        </p>
      </div>

      <SearchBar cities={cities} />
    </section>
  )
}
