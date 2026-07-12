import { Check } from 'lucide-react'
import HeroSearch from '@/components/site/HeroSearch'
import PitchLines from '@/components/public/PitchLines'
import type { CityCount } from '@/modules/tenants/search.service'
import { BookingCardMockup } from './BookingCardMockup'

/**
 * Sección hero de la landing pública. Único dato externo: `cities` (para el
 * combobox de localidad de `HeroSearch`) — el resto (titular, subtítulo,
 * pills de confianza, mockup) es estático.
 */
export function Hero({ cities }: { cities: CityCount[] }) {
  return (
    <section className="relative flex min-h-[84vh] items-center overflow-hidden px-4 pt-[110px] pb-[64px] sm:px-6 sm:pt-[120px] sm:pb-[84px]">
      {/* Ambiente dark: foto nocturna (solo dark — sobre el clima claro ensucia) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden opacity-30 dark:block"
        style={{
          backgroundImage: "url('/bg-hero-2.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          transform: 'scale(1.05)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* Ambiente light: líneas de cal (firma "Matchday") */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[-12%] z-0 h-[68%] text-emerald-600/[.14] dark:hidden">
        <PitchLines className="h-full w-full" />
      </div>
      {/* Glow blobs */}
      <div
        aria-hidden
        className="hero-glow-blob pointer-events-none absolute right-[-6%] top-[-10%] z-0 h-[760px] w-[760px] animate-tg-drift rounded-full blur-[8px] motion-reduce:animate-none"
      />
      <div
        aria-hidden
        className="hero-glow-blob pointer-events-none absolute bottom-[-20%] left-[-10%] z-0 h-[620px] w-[620px] rounded-full opacity-50"
      />
      {/* Partículas flotantes (ambiente nocturno) */}
      <span
        aria-hidden
        className="hero-particle pointer-events-none absolute left-[8%] top-[24%] z-0 hidden h-[6px] w-[6px] animate-tg-float rounded-full motion-reduce:!hidden dark:block"
      />
      <span
        aria-hidden
        className="hero-particle pointer-events-none absolute bottom-[18%] right-[40%] z-0 hidden h-[5px] w-[5px] rounded-full motion-reduce:!hidden dark:block"
        style={{ animation: 'tg-float 10s ease-in-out infinite 0.8s' }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 lg:grid-cols-[1.04fr_0.96fr]">
        {/* Columna izquierda */}
        <div className="min-w-0">
          {/* Titular */}
          <h1
            className="mt-1 font-display font-black italic text-foreground dark:[text-shadow:0_12px_60px_rgba(0,0,0,.5)]"
            style={{
              fontSize: 'clamp(38px, 5.2vw, 78px)',
              lineHeight: '0.95',
              letterSpacing: '-0.035em',
            }}
          >
            Reservá tu cancha
            <br />
            <span className="hero-accent-text">al instante.</span>
          </h1>

          {/* Subtítulo */}
          <p
            className="mt-4 max-w-[540px] text-muted-foreground"
            style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: '1.55' }}
          >
            Explorá complejos verificados, compará horarios en tiempo real y{' '}
            <span className="font-semibold text-foreground">asegurá tu cancha</span>{' '}
            con confirmación inmediata.
          </p>

          {/* Buscador */}
          <div className="relative mt-5 max-w-[560px]">
            <HeroSearch cities={cities} layout="vertical" />
          </div>

          {/* Pills de confianza */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5">
            {['Reservá al instante', 'Pago seguro con MercadoPago', 'Confirmación inmediata'].map((t) => (
              <span key={t} className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" strokeWidth={2.4} aria-hidden />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Columna derecha: mockup de reserva */}
        <BookingCardMockup />
      </div>
    </section>
  )
}
