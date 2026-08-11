import { Check } from 'lucide-react'
import HeroSearch from '@/components/site/HeroSearch'
import PitchLines from '@/components/public/PitchLines'
import type { CityCount } from '@/modules/tenants/search.service'

/**
 * Hero desktop (lg+, ≥1024px). Foto de estadio full-bleed centrada (dark) /
 * líneas de cancha (light) con headline + buscador horizontal centrados
 * encima — sin card de mockup lateral. Hermano de HeroMobile, que sigue
 * cubriendo <lg sin cambios; la visibilidad de ambos es 100% CSS (`hidden
 * lg:flex` acá, `lg:hidden` en HeroMobile), nunca JS por tamaño de pantalla.
 */
export function HeroDesktop({ cities }: { cities: CityCount[] }) {
  return (
    <section className="relative hidden min-h-[92vh] items-center justify-center overflow-hidden px-6 pt-[130px] pb-20 lg:flex">
      {/* Ambiente dark: foto de estadio full-bleed (el <section> no está
          anidado en ningún max-w-*, así que esta capa ya es full-bleed real) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 hidden dark:block"
        style={{
          backgroundImage: "url('/bg-hero-desktop.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%',
        }}
      />
      {/* Scrim oscuro sobre la foto: garantiza AA del headline/texto centrado */}
      <div aria-hidden className="hero-desktop-scrim pointer-events-none absolute inset-0 z-[1] hidden dark:block" />

      {/* Ambiente light: líneas de cal, reposicionadas para el layout centrado */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[-6%] z-0 h-[55%] text-emerald-600/[.14] dark:hidden">
        <div className="mx-auto h-full max-w-[1400px]">
          <PitchLines className="h-full w-full" />
        </div>
      </div>

      {/* Glow blobs (mismo lenguaje que el resto del hero) */}
      <div
        aria-hidden
        className="hero-glow-blob pointer-events-none absolute right-[-8%] top-[-15%] z-0 h-[820px] w-[820px] animate-tg-drift rounded-full blur-sm motion-reduce:animate-none"
      />
      <div
        aria-hidden
        className="hero-glow-blob pointer-events-none absolute bottom-[-25%] left-[-12%] z-0 h-[700px] w-[700px] rounded-full opacity-50"
      />

      {/* Partículas flotantes (ambiente nocturno, dark only) */}
      <span
        aria-hidden
        className="hero-particle pointer-events-none absolute left-[18%] top-[22%] z-0 hidden h-[6px] w-[6px] animate-tg-float rounded-full motion-reduce:hidden! dark:block"
      />
      <span
        aria-hidden
        className="hero-particle pointer-events-none absolute bottom-[26%] right-[16%] z-0 hidden h-[5px] w-[5px] rounded-full motion-reduce:hidden! dark:block"
        style={{ animation: 'tg-float 10s ease-in-out infinite 0.8s' }}
      />

      {/* Contenido centrado */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col items-center px-4 text-center">
        <h1
          className="font-display font-black italic text-foreground dark:[text-shadow:0_12px_60px_rgba(0,0,0,.6)]"
          style={{ fontSize: 'clamp(48px, 5.6vw, 88px)', lineHeight: '0.95', letterSpacing: '-0.035em' }}
        >
          Reservá tu cancha
          <br />
          <span className="hero-accent-text">al instante.</span>
        </h1>

        <p
          className="mt-5 max-w-[620px] text-muted-foreground"
          style={{ fontSize: 'clamp(17px, 1.3vw, 21px)', lineHeight: '1.55' }}
        >
          Explorá complejos verificados, compará horarios en tiempo real y{' '}
          <span className="font-semibold text-foreground">asegurá tu cancha</span>{' '}
          con confirmación inmediata.
        </p>

        <div className="relative mt-9 w-full max-w-[1140px]">
          <HeroSearch cities={cities} layout="horizontal" />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
          {['Reservá al instante', 'Pago seguro con MercadoPago', 'Confirmación inmediata'].map((t) => (
            <span key={t} className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" strokeWidth={2.4} aria-hidden />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
