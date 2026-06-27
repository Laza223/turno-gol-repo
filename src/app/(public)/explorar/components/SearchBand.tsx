import type { CityCount } from '@/modules/tenants/search.service'
import SearchBar from './SearchBar'

/**
 * Banda hero de /explorar: banda oscura premium (puente visual con el home)
 * que enmarca el titular y el form de búsqueda (tarjeta blanca glassmorphism).
 */
export default function SearchBand({ cities }: { cities: CityCount[] }) {
  return (
    <section
      className="relative isolate z-30 rounded-3xl border border-white/[.08] px-5 py-7 sm:px-9 sm:py-9"
      style={{
        background: 'linear-gradient(135deg, #07131d 0%, #020617 58%)',
        boxShadow: '0 30px 70px -42px rgba(0,0,0,.9)',
      }}
    >
      {/* Contenedor de fondo con overflow-hidden para evitar que los blobs decorativos desborden la pantalla horizontalmente */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        {/* Glow blob */}
        <div
          aria-hidden
          className="absolute right-[-10%] top-[-70%] h-[480px] w-[480px] rounded-full blur-[12px]"
          style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.26), transparent 70%)' }}
        />
        {/* Grid pattern */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            WebkitMaskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
            maskImage: 'radial-gradient(85% 120% at 100% 0%, #000, transparent 62%)',
          }}
        />
      </div>

      <div className="mb-6 max-w-2xl">
        <div className="inline-flex items-center gap-2.5 font-logo text-[12.5px] font-bold uppercase tracking-[.1em] text-emerald-400">
          <span className="relative flex h-[9px] w-[9px]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
          </span>
          Disponibilidad en tiempo real
        </div>
        <h1
          className="mt-[14px] font-display font-black italic text-white"
          style={{ fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: '1', letterSpacing: '-0.03em' }}
        >
          Encontrá tu cancha{' '}
          <span
            style={{
              background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              paddingRight: '0.15em',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
            }}
          >
            ideal
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Filtrá por formato, superficie, servicios y precio. Consultá disponibilidad en tiempo real y reservá al instante.
        </p>
      </div>

      <SearchBar cities={cities} />
    </section>
  )
}
