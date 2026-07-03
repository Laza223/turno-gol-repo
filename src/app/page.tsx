import * as Sentry from '@sentry/nextjs'
import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import Link from 'next/link'
import { ArrowRight, Building2, CalendarDays, CheckCircle2, Check, MapPin, Search, Star } from 'lucide-react'
import SiteNav from '@/components/site/SiteNav'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import SiteFooter from '@/components/site/SiteFooter'
import HeroSearch from '@/components/site/HeroSearch'
import FeaturedComplexCard from '@/components/site/FeaturedComplexCard'
import Reveal from '@/components/site/Reveal'
import PitchLines from '@/components/public/PitchLines'
import {
  listPublicCities,
  searchPublicTenants,
  type CityCount,
  type PublicTenantCard,
} from '@/modules/tenants/search.service'

export const metadata = buildMetadata({
  title: 'TurnoGol — Reservá tu cancha de fútbol al instante',
  description:
    'Explorá complejos de fútbol en tu ciudad, compará disponibilidad en tiempo real y reservá tu cancha online. Confirmación inmediata, pago seguro con MercadoPago.',
  path: '/',
  titleAbsolute: true,
})

export const revalidate = 300

async function loadCities(): Promise<CityCount[]> {
  try {
    return await listPublicCities()
  } catch (err) {
    Sentry.captureException(err, { tags: { section: 'landing.cities' } })
    return []
  }
}

async function loadFeatured(): Promise<PublicTenantCard[]> {
  try {
    const { results } = await searchPublicTenants({ sort: 'rating', limit: 6 })
    return results
  } catch (err) {
    Sentry.captureException(err, { tags: { section: 'landing.featured' } })
    return []
  }
}

const howItWorks = [
  {
    n: '01',
    icon: Search,
    title: 'Explorá complejos',
    description:
      'Elegí tu ciudad, fecha y horario. Filtrá por superficie, precio o cercanía y encontrá el complejo ideal para tu partido.',
  },
  {
    n: '02',
    icon: CalendarDays,
    title: 'Compará disponibilidad',
    description:
      'Visualizá la disponibilidad actualizada en tiempo real y elegí el horario que más te convenga. Sin intermediarios.',
  },
  {
    n: '03',
    icon: CheckCircle2,
    title: 'Confirmá y jugá',
    description:
      'Reservá con pago seguro a través de MercadoPago y tu cancha queda asegurada. Solo queda la pelota.',
  },
]

const playerStats = [
  { value: '+10.000', label: 'Reservas completadas' },
  { value: '50+', label: 'Complejos en la plataforma' },
  { value: '95%', label: 'Tasa de asistencia' },
  { value: '<2 min', label: 'Tiempo promedio de reserva' },
]

export default async function HomePage() {
  const [cities, featured] = await Promise.all([loadCities(), loadFeatured()])

  return (
    <div className="landing-hero min-h-dvh text-foreground">
      <JsonLd data={[buildOrganization(), buildWebSite()]} />
      <PortalSessionProvider>
        <SiteNav variant="overlay" />
      </PortalSessionProvider>
      <Hero cities={cities} />
      {featured.length > 0 && <FeaturedComplexes complexes={featured} />}
      <HowItWorks />
      <StatsBar />
      <OwnerBanner />
      <SiteFooter />
    </div>
  )
}

function Hero({ cities }: { cities: CityCount[] }) {
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
          {/* Pill de estado en vivo */}
          <div className="live-pill inline-flex items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold">
            <span className="relative flex h-[9px] w-[9px] shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
            </span>
            Disponibilidad en tiempo real
          </div>

          {/* Titular */}
          <h1
            className="mt-[22px] font-display font-black italic text-foreground dark:[text-shadow:0_12px_60px_rgba(0,0,0,.5)]"
            style={{
              fontSize: 'clamp(42px, 5.2vw, 78px)',
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
            className="mt-6 max-w-[540px] text-muted-foreground"
            style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: '1.55' }}
          >
            Explorá complejos verificados, compará horarios en tiempo real y{' '}
            <span className="font-semibold text-foreground">asegurá tu cancha</span>{' '}
            con confirmación inmediata.
          </p>

          {/* Buscador */}
          <div className="relative mt-8 max-w-[560px]">
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

const BOOKING_SLOTS = [
  { time: '18:00', state: 'occupied' },
  { time: '19:00', state: 'free' },
  { time: '20:00', state: 'free' },
  { time: '21:00', state: 'selected' },
  { time: '22:00', state: 'free' },
  { time: '23:00', state: 'occupied' },
] as const

const SLOT_CLASSES: Record<(typeof BOOKING_SLOTS)[number]['state'], { box: string; time: string; label: string }> = {
  selected: {
    box: 'border border-emerald-500 bg-gradient-to-br from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-600/40 dark:from-emerald-500 dark:to-emerald-600 dark:shadow-emerald-500/40',
    time: 'text-white dark:text-slate-950',
    label: 'text-emerald-100 dark:text-emerald-950',
  },
  free: {
    box: 'border border-emerald-600/30 bg-emerald-600/[.07] dark:border-emerald-500/30 dark:bg-emerald-500/[.08]',
    time: 'text-emerald-800 dark:text-emerald-300',
    label: 'text-emerald-700 dark:text-emerald-400',
  },
  occupied: {
    box: 'border border-border bg-muted/50 opacity-60 dark:border-white/[.06] dark:bg-white/[.03]',
    time: 'text-muted-foreground line-through',
    label: 'text-muted-foreground/70',
  },
}

function BookingCardMockup() {
  return (
    <div className="relative hidden min-w-0 lg:block" aria-hidden>
      {/* Glow detrás de la card */}
      <div className="hero-glow-blob pointer-events-none absolute inset-[6%_8%] rounded-[28px] blur-[30px]" />

      {/* Card principal */}
      <div
        className="mockup-card relative overflow-hidden rounded-3xl"
        style={{ animation: 'tg-float 9s ease-in-out infinite' }}
      >
        {/* Cover */}
        <div className="mockup-cover relative h-[132px] overflow-hidden">
          <div
            className="player-hero-grid absolute inset-0 bg-[length:30px_30px]"
            style={{
              WebkitMaskImage: 'linear-gradient(180deg, #000, transparent)',
              maskImage: 'linear-gradient(180deg, #000, transparent)',
            }}
          />
          <span
            className="absolute left-[22px] top-1/2 -translate-y-1/2 font-display font-black italic text-emerald-950/[.14] dark:text-white/[.16]"
            style={{ fontSize: '46px', letterSpacing: '-0.04em' }}
          >
            LC
          </span>
          {/* Badge "En vivo" */}
          <div className="live-pill absolute right-4 top-4 inline-flex items-center gap-[7px] rounded-full px-3 py-[6px] text-[11px] font-bold uppercase tracking-[.08em]">
            <span className="relative flex h-[7px] w-[7px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-emerald-500 dark:bg-emerald-400" />
            </span>
            En vivo
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-[22px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-[19px] font-bold text-foreground">La Catedral F5</div>
              <div className="mt-[5px] flex items-center gap-[6px] text-[13px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" strokeWidth={2} aria-hidden />
                Palermo · a 1,2 km
              </div>
            </div>
            <div className="inline-flex shrink-0 items-center gap-[5px] rounded-full border border-emerald-600/25 bg-emerald-600/10 px-[10px] py-[5px] text-[13px] font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/[.12] dark:text-emerald-300">
              <Star className="h-[13px] w-[13px] fill-current" strokeWidth={0} aria-hidden />
              4,9
            </div>
          </div>

          {/* Header de slots */}
          <div className="mb-[10px] mt-[18px] flex items-center justify-between">
            <span className="font-logo text-[12px] font-bold uppercase tracking-[.06em] text-muted-foreground">
              Turnos · Hoy
            </span>
            <span className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">4 libres</span>
          </div>

          {/* Grilla de slots */}
          <div className="grid grid-cols-3 gap-[9px]">
            {BOOKING_SLOTS.map(({ time, state }) => {
              const c = SLOT_CLASSES[state]
              return (
                <div key={time} className={`flex flex-col items-center gap-[2px] rounded-xl px-1 py-[11px] ${c.box}`}>
                  <span className={`font-logo text-[15px] font-bold tabular-nums ${c.time}`}>{time}</span>
                  <span className={`text-[10px] uppercase tracking-[.04em] ${c.label}`}>
                    {state === 'selected' ? 'Elegido' : state === 'free' ? 'Libre' : 'Ocupado'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Pie de card */}
          <div className="mt-[18px] flex items-center justify-between gap-3 border-t border-border pt-4 dark:border-white/[.08]">
            <div>
              <div className="font-logo text-[11px] uppercase tracking-[.05em] text-muted-foreground">Seña</div>
              <div className="font-display text-[20px] font-bold tabular-nums text-foreground">$ 8.000</div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-[10px] text-[13.5px] font-semibold text-primary-foreground shadow-lg shadow-emerald-600/30 dark:shadow-emerald-500/30">
              Reservar 21:00
              <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.4} aria-hidden />
            </div>
          </div>
        </div>
      </div>

      {/* Toast flotante "Turno confirmado" — cuelga del borde inferior para no
          tapar el precio/CTA del mockup */}
      <div
        className="overlay-nav absolute -bottom-4 -left-[26px] inline-flex items-center gap-[9px] rounded-[14px] px-3.5 py-2.5"
        style={{ animation: 'tg-float 7s ease-in-out infinite 1.4s' }}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/[.18] dark:text-emerald-400">
          <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden />
        </span>
        <div>
          <div className="text-[13px] font-bold text-foreground">Turno confirmado</div>
          <div className="text-[11px] text-muted-foreground">hace 2 minutos</div>
        </div>
      </div>
    </div>
  )
}

function FeaturedComplexes({ complexes }: { complexes: PublicTenantCard[] }) {
  return (
    <section id="cerca" className="relative z-10 scroll-mt-[90px] py-10 sm:py-16">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal>
          <div className="mb-[34px] flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-[9px] whitespace-nowrap font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-800 dark:text-emerald-400">
                <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
                Complejos verificados
              </div>
              <h2
                className="mt-[14px] font-display font-black italic text-foreground"
                style={{
                  fontSize: 'clamp(34px, 4vw, 50px)',
                  lineHeight: '1',
                  letterSpacing: '-0.025em',
                }}
              >
                Los mejor valorados
              </h2>
              <p className="mt-[14px] max-w-[540px] text-base leading-[1.55] text-muted-foreground">
                Complejos con las mejores reseñas y disponibilidad en tiempo real. Elegí, reservá y jugá.
              </p>
            </div>
            <Link
              href="/explorar"
              className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent active:scale-[0.98] dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
            >
              Ver todos
              <ArrowRight
                className="h-[17px] w-[17px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                aria-hidden
              />
            </Link>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
          {complexes.map((t, i) => (
            <Reveal key={t.id} delay={i * 60} className="h-full">
              <FeaturedComplexCard tenant={t} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="relative z-10 overflow-hidden py-20 sm:py-24">
      {/* Foto de ambiente: solo dark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1] hidden opacity-[0.12] mix-blend-luminosity dark:block"
        style={{
          backgroundImage: "url('/bg-how-it-works.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: 'scale(1.05)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-[620px] text-center">
            <div className="inline-flex items-center gap-[9px] whitespace-nowrap font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-800 dark:text-emerald-400">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
              Así de simple
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-foreground"
              style={{
                fontSize: 'clamp(34px, 4vw, 50px)',
                lineHeight: '1',
                letterSpacing: '-0.025em',
              }}
            >
              Del buscador a la cancha
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-muted-foreground">
              Tres pasos y tu cancha está asegurada. Reserva online, confirmación inmediata.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-3">
          {howItWorks.map((step, i) => (
            <Reveal key={step.n} delay={i * 80}>
              <div className="card-premium relative overflow-hidden p-7">
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[18px] top-[6px] font-display font-black italic leading-none text-foreground/[.05]"
                  style={{ fontSize: '92px', letterSpacing: '-0.05em' }}
                >
                  {step.n}
                </span>
                <div className="icon-halo relative inline-flex h-[52px] w-[52px] items-center justify-center rounded-[14px]">
                  <step.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="relative mt-5 font-display text-xl font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="relative mt-2.5 text-[14.5px] leading-[1.6] text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatsBar() {
  return (
    <section className="relative z-10">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="stats-band relative overflow-hidden rounded-3xl p-7 sm:p-11">
          <div
            aria-hidden
            className="hero-glow-blob pointer-events-none absolute left-1/2 top-[-40%] hidden h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-[20px] dark:block"
          />
          <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
            {playerStats.map((s, i) => (
              <div
                key={s.label}
                className={`text-center ${i > 0 ? 'border-l border-emerald-900/10 dark:border-white/10' : ''}`}
              >
                <div
                  className="hero-accent-text font-display font-black italic leading-none"
                  style={{ fontSize: 'clamp(34px, 4.6vw, 56px)' }}
                >
                  {s.value}
                </div>
                <div className="mt-[10px] font-logo text-[12.5px] font-bold uppercase tracking-[.08em] text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function OwnerBanner() {
  return (
    <section id="partners" className="relative z-10 py-14 sm:py-20">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal>
          <div className="cta-band relative isolate overflow-hidden rounded-3xl p-7 sm:p-11">
            {/* Foto de ambiente: solo dark */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[-2] hidden opacity-25 dark:block"
              style={{
                backgroundImage: "url('/bg-owner.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                transform: 'scale(1.05)',
              }}
            />
            {/* Glow (solo dark; en light la banda ya trae tinte propio) */}
            <div
              aria-hidden
              className="hero-glow-blob pointer-events-none absolute right-[-8%] top-[-60%] z-[-1] hidden h-[620px] w-[620px] rounded-full blur-[16px] dark:block"
            />
            {/* Retícula */}
            <div
              aria-hidden
              className="player-hero-grid pointer-events-none absolute inset-0 z-[-1] bg-[length:40px_40px]"
              style={{
                WebkitMaskImage: 'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
                maskImage: 'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
              }}
            />

            <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-[22px]">
                {/* Ícono */}
                <div className="icon-halo inline-flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center rounded-2xl">
                  <Building2 className="h-7 w-7" aria-hidden />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 font-logo text-xs font-bold uppercase tracking-[.1em] text-emerald-800 dark:text-emerald-400">
                    Solución para complejos
                  </div>
                  <h2
                    className="font-display font-black italic text-foreground"
                    style={{
                      fontSize: 'clamp(28px, 3.2vw, 40px)',
                      letterSpacing: '-0.025em',
                      lineHeight: '1.02',
                    }}
                  >
                    Llevá tu complejo al siguiente nivel
                  </h2>
                  <p className="mt-3 max-w-[560px] text-base leading-[1.55] text-muted-foreground">
                    Automatizá reservas, cobrá señas con MercadoPago y conectá con miles de jugadores activos. Tu complejo, vendiendo canchas 24/7.
                  </p>
                </div>
              </div>

              <Link
                href="/para-complejos"
                className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 dark:shadow-emerald-500/25 sm:self-auto"
              >
                Registrá tu complejo
                <ArrowRight
                  className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                  aria-hidden
                />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
