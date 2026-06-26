import * as Sentry from '@sentry/nextjs'
import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import Link from 'next/link'
import { ArrowRight, Building2, CalendarDays, CheckCircle2, Search } from 'lucide-react'
import SiteNav from '@/components/site/SiteNav'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import SiteFooter from '@/components/site/SiteFooter'
import HeroSearch from '@/components/site/HeroSearch'
import FeaturedComplexCard from '@/components/site/FeaturedComplexCard'
import Reveal from '@/components/site/Reveal'
import {
  listPublicCities,
  searchPublicTenants,
  type CityCount,
  type PublicTenantCard,
} from '@/modules/tenants/search.service'

export const metadata = buildMetadata({
  title: 'TurnoGol — Encontrá y reservá tu cancha de fútbol',
  description:
    'Buscá complejos de fútbol cerca tuyo, mirá disponibilidad en tiempo real y reservá tu cancha online en segundos. Sin llamados, sin esperas.',
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
    title: 'Buscá tu cancha',
    description:
      'Elegí ciudad, fecha y hora. Filtrá por superficie, precio o cercanía y encontrá el complejo ideal.',
  },
  {
    n: '02',
    icon: CalendarDays,
    title: 'Elegí tu horario',
    description:
      'Mirá la disponibilidad en tiempo real y quedate con el turno que mejor te sirva. Cero esperas.',
  },
  {
    n: '03',
    icon: CheckCircle2,
    title: 'Reservá y jugá',
    description:
      'Confirmá con seña online y listo: tu cancha queda asegurada. Solo te queda llevar la pelota.',
  },
]

const playerStats = [
  { value: '+10.000', label: 'Turnos reservados' },
  { value: '50+', label: 'Complejos disponibles' },
  { value: '95%', label: 'Asistencia confirmada' },
  { value: '<2 min', label: 'Para reservar tu turno' },
]

export default async function HomePage() {
  const [cities, featured] = await Promise.all([loadCities(), loadFeatured()])

  return (
    <div
      className="min-h-dvh text-slate-300"
      style={{ background: '#020617' }}
    >
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
    <section className="relative flex min-h-[84vh] items-center overflow-hidden px-6 py-[60px] pb-[84px]">
      {/* Background Image */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-30"
        style={{
          backgroundImage: "url('/bg-hero-2.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          transform: 'scale(1.05)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* Right glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-6%] top-[-10%] z-0 h-[760px] w-[760px] animate-tg-drift rounded-full blur-[8px] motion-reduce:animate-none"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.28), transparent 70%)' }}
      />
      {/* Left glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] z-0 h-[620px] w-[620px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(5,150,105,.12), transparent 72%)' }}
      />
      {/* Floating particles */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[8%] top-[24%] z-0 h-[6px] w-[6px] animate-tg-float rounded-full bg-emerald-400 motion-reduce:hidden"
        style={{ boxShadow: '0 0 16px 4px rgba(52,211,153,.6)' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[18%] right-[40%] z-0 h-[5px] w-[5px] rounded-full bg-emerald-300 motion-reduce:hidden"
        style={{
          boxShadow: '0 0 14px 3px rgba(110,231,183,.55)',
          animation: 'tg-float 10s ease-in-out infinite 0.8s',
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1240px] grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.04fr_0.96fr]">
        {/* Left column */}
        <div className="min-w-0">
          {/* Live status pill */}
          <div
            className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-[#6ee7b7] backdrop-blur-sm"
            style={{ boxShadow: 'inset 0 0 30px rgba(16,185,129,.14)', whiteSpace: 'nowrap' }}
          >
            <span className="relative flex h-[9px] w-[9px] shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
            </span>
            Disponibilidad en tiempo real
          </div>

          {/* Heading */}
          <h1
            className="mt-[22px] font-display font-black italic text-[#f8fafc]"
            style={{
              fontSize: 'clamp(46px, 5.2vw, 78px)',
              lineHeight: '0.95',
              letterSpacing: '-0.035em',
              textShadow: '0 12px 60px rgba(0,0,0,.5)',
            }}
          >
            Tu cancha de Fútbol 5,
            <br />
            <span
              style={{
                background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              lista en un toque.
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="mt-6 max-w-[540px] text-slate-400"
            style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: '1.55' }}
          >
            Cero llamados, cero vueltas. Mirá qué hay libre ahora mismo y{' '}
            <span className="font-semibold text-slate-200">clavá tu turno</span>{' '}
            antes de que te lo ganen.
          </p>

          {/* Search form — vertical layout */}
          <div className="relative mt-8 max-w-[560px]">
            <div
              aria-hidden
              className="absolute -inset-px rounded-3xl opacity-85 blur-[11px]"
              style={{
                background:
                  'linear-gradient(120deg, rgba(16,185,129,.4), transparent 42%, transparent 60%, rgba(52,211,153,.32))',
              }}
            />
            <HeroSearch cities={cities} layout="vertical" />
          </div>

          {/* Trust pills */}
          <div className="mt-6 flex flex-wrap items-center gap-5">
            {['Sin llamados', 'Seña online segura', 'Confirmación al instante'].map((t) => (
              <span key={t} className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-400">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Right column: decorative booking card */}
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

function BookingCardMockup() {
  return (
    <div className="relative hidden min-w-0 lg:block" aria-hidden>
      {/* Glow behind card */}
      <div
        className="pointer-events-none absolute inset-[6%_8%] rounded-[28px] blur-[30px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.3), transparent 75%)' }}
      />

      {/* Main card */}
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(15,23,42,.86), rgba(2,6,23,.92))',
          border: '1px solid rgba(255,255,255,.1)',
          boxShadow:
            '0 0 70px rgba(16,185,129,.21), 0 50px 90px -40px rgba(0,0,0,.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'tg-float 9s ease-in-out infinite',
        }}
      >
        {/* Cover */}
        <div
          className="relative h-[132px] overflow-hidden"
          style={{
            background:
              'radial-gradient(120% 140% at 80% 0%, rgba(16,185,129,.42), rgba(5,150,105,.12) 45%, rgba(2,6,23,0) 75%), linear-gradient(135deg, #064e3b, #022c22)',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              WebkitMaskImage: 'linear-gradient(180deg, #000, transparent)',
              maskImage: 'linear-gradient(180deg, #000, transparent)',
            }}
          />
          <span
            className="absolute left-[22px] top-1/2 -translate-y-1/2 font-display font-black italic text-white/[.16]"
            style={{ fontSize: '46px', letterSpacing: '-0.04em' }}
          >
            LC
          </span>
          {/* En vivo badge */}
          <div
            className="absolute right-4 top-4 inline-flex items-center gap-[7px] rounded-full px-3 py-[6px] text-[11px] font-bold uppercase tracking-[.08em] text-[#6ee7b7]"
            style={{
              background: 'rgba(2,6,23,.6)',
              border: '1px solid rgba(16,185,129,.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <span className="relative flex h-[7px] w-[7px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-emerald-400" />
            </span>
            En vivo
          </div>
        </div>

        {/* Body */}
        <div className="p-[22px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display font-bold text-[19px] text-[#f8fafc]">La Catedral F5</div>
              <div className="mt-[5px] flex items-center gap-[6px] text-[13px] text-slate-400">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Palermo · a 1,2 km
              </div>
            </div>
            <div
              className="inline-flex shrink-0 items-center gap-[5px] rounded-full px-[10px] py-[5px] text-[13px] font-bold text-[#6ee7b7]"
              style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#34d399" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z" />
              </svg>
              4,9
            </div>
          </div>

          {/* Slots header */}
          <div className="mb-[10px] mt-[18px] flex items-center justify-between">
            <span className="font-logo text-[12px] font-bold uppercase tracking-[.06em] text-slate-500">
              Turnos · Hoy
            </span>
            <span className="text-[12px] font-semibold text-emerald-400">4 libres</span>
          </div>

          {/* Slots grid */}
          <div className="grid grid-cols-3 gap-[9px]">
            {BOOKING_SLOTS.map(({ time, state }) => (
              <div
                key={time}
                className="flex flex-col items-center gap-[2px] rounded-[12px] px-1 py-[11px]"
                style={
                  state === 'selected'
                    ? {
                      background: 'linear-gradient(160deg, #10b981, #059669)',
                      border: '1px solid #34d399',
                      boxShadow:
                        '0 0 22px rgba(16,185,129,.55), inset 0 1px 0 rgba(255,255,255,.3)',
                    }
                    : state === 'free'
                      ? {
                        background: 'rgba(16,185,129,.08)',
                        border: '1px solid rgba(16,185,129,.32)',
                      }
                      : {
                        background: 'rgba(255,255,255,.03)',
                        border: '1px solid rgba(255,255,255,.06)',
                        opacity: '0.55',
                      }
                }
              >
                <span
                  className={`font-logo font-bold text-[15px] ${state === 'selected'
                    ? 'text-white'
                    : state === 'free'
                      ? 'text-[#6ee7b7]'
                      : 'text-slate-500 line-through'
                    }`}
                >
                  {time}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-[.04em] ${state === 'selected'
                    ? 'text-[#d1fae5]'
                    : state === 'free'
                      ? 'text-emerald-400'
                      : 'text-slate-600'
                    }`}
                >
                  {state === 'selected' ? 'Elegido' : state === 'free' ? 'Libre' : 'Ocupado'}
                </span>
              </div>
            ))}
          </div>

          {/* Card footer */}
          <div className="mt-[18px] flex items-center justify-between gap-3 border-t border-white/[.08] pt-[16px]">
            <div>
              <div className="font-logo text-[11px] uppercase tracking-[.05em] text-slate-500">Seña</div>
              <div className="font-display font-bold text-[20px] text-[#f8fafc]">$8.000</div>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-xl px-5 py-[10px] text-[13.5px] font-semibold text-white"
              style={{ background: '#059669', boxShadow: '0 4px 20px rgba(16,185,129,.4)' }}
            >
              Reservar 21:00
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Floating "Turno confirmado" toast */}
      <div
        className="absolute -left-[26px] bottom-9 inline-flex items-center gap-[9px] rounded-[14px] p-[10px_14px]"
        style={{
          background: 'rgba(8,15,32,.88)',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 18px 40px -18px rgba(0,0,0,.9)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          animation: 'tg-float 7s ease-in-out infinite 1.4s',
        }}
      >
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-emerald-400"
          style={{ background: 'rgba(16,185,129,.18)' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <div className="text-[13px] font-bold text-[#f1f5f9]">Turno confirmado</div>
          <div className="text-[11px] text-slate-500">hace 2 minutos</div>
        </div>
      </div>
    </div>
  )
}

function FeaturedComplexes({ complexes }: { complexes: PublicTenantCard[] }) {
  return (
    <section
      id="cerca"
      className="relative z-10 py-10 sm:py-16 scroll-mt-[90px]"
    >
      <div className="mx-auto max-w-[1240px] px-6">
        <Reveal>
          <div className="mb-[34px] flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
                <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
                Cerca tuyo
              </div>
              <h2
                className="mt-[14px] font-display font-black italic text-[#f8fafc]"
                style={{
                  fontSize: 'clamp(34px, 4vw, 50px)',
                  lineHeight: '1',
                  letterSpacing: '-0.025em',
                }}
              >
                Complejos destacados
              </h2>
              <p className="mt-[14px] max-w-[540px] text-base leading-[1.55] text-slate-400">
                Los mejor valorados de la plataforma. Mirá horarios reales y reservá online en
                segundos.
              </p>
            </div>
            <Link
              href="/explorar"
              className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
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
    <section className="relative z-10 py-20 sm:py-24 overflow-hidden">
      {/* Background Image */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1] opacity-[0.12] mix-blend-luminosity"
        style={{
          backgroundImage: "url('/bg-how-it-works.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: 'scale(1.05)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div className="mx-auto max-w-[1240px] px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-[620px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Reservar es fácil
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{
                fontSize: 'clamp(34px, 4vw, 50px)',
                lineHeight: '1',
                letterSpacing: '-0.025em',
              }}
            >
              Cómo funciona
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-slate-400">
              De buscar a jugar en tres pasos. Sin vueltas, sin llamados.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-3">
          {howItWorks.map((step, i) => (
            <Reveal key={step.n} delay={i * 80}>
              <div
                className="relative overflow-hidden border border-white/[.09] p-7"
                style={{
                  borderRadius: '20px',
                  background: 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))',
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[18px] top-[6px] font-display font-black italic leading-none text-white/[.045]"
                  style={{ fontSize: '92px', letterSpacing: '-0.05em' }}
                >
                  {step.n}
                </span>
                <div
                  className="relative inline-flex h-[52px] w-[52px] items-center justify-center text-emerald-400"
                  style={{
                    borderRadius: '14px',
                    background: 'rgba(16,185,129,.12)',
                    border: '1px solid rgba(16,185,129,.3)',
                    boxShadow: 'inset 0 0 20px rgba(16,185,129,.15)',
                  }}
                >
                  <step.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="relative mt-5 font-display font-bold text-xl text-[#f8fafc]">
                  {step.title}
                </h3>
                <p className="relative mt-2.5 text-[14.5px] leading-[1.6] text-slate-400">
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
      <div className="mx-auto max-w-[1240px] px-6">
        <div
          className="relative overflow-hidden rounded-3xl border border-emerald-500/[.22] p-11"
          style={{
            background:
              'linear-gradient(120deg, rgba(6,78,59,.55), rgba(2,6,23,.35) 55%, rgba(6,78,59,.4))',
            boxShadow:
              '0 0 70px rgba(16,185,129,.165), inset 0 1px 0 rgba(255,255,255,.06)',
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-40%] h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-[20px]"
            style={{
              background: 'radial-gradient(closest-side, rgba(16,185,129,.3), transparent 72%)',
            }}
          />
          <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
            {playerStats.map((s, i) => (
              <div
                key={s.label}
                className={`text-center ${i > 0 ? 'border-l border-white/10' : ''}`}
              >
                <div
                  className="font-display font-black italic leading-none"
                  style={{
                    fontSize: 'clamp(40px, 4.6vw, 56px)',
                    background: 'linear-gradient(180deg, #ffffff, #6ee7b7)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  {s.value}
                </div>
                <div className="mt-[10px] font-logo text-[12.5px] font-bold uppercase tracking-[.08em] text-slate-400">
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
      <div className="mx-auto max-w-[1240px] px-6">
        <Reveal>
          <div
            className="relative isolate overflow-hidden"
            style={{
              borderRadius: '24px',
              padding: '44px',
              border: '1px solid rgba(255,255,255,.1)',
              background:
                'linear-gradient(120deg, rgba(15,23,42,.85), rgba(2,6,23,.9))',
              boxShadow: '0 30px 70px -40px rgba(0,0,0,.9)',
            }}
          >
            {/* Background Image */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[-2] opacity-25"
              style={{
                backgroundImage: "url('/bg-owner.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                transform: 'scale(1.05)'
              }}
            />
            {/* Background glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute right-[-8%] top-[-60%] z-[-1] h-[620px] w-[620px] rounded-full blur-[16px]"
              style={{
                background:
                  'radial-gradient(closest-side, rgba(16,185,129,.27), transparent 70%)',
              }}
            />
            {/* Grid pattern */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[-1]"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                WebkitMaskImage:
                  'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
                maskImage:
                  'radial-gradient(80% 120% at 100% 0%, #000, transparent 60%)',
              }}
            />

            <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-[22px] min-w-0">
                {/* Icon */}
                <div
                  className="flex-shrink-0 inline-flex h-[60px] w-[60px] items-center justify-center text-emerald-400"
                  style={{
                    borderRadius: '16px',
                    background: 'rgba(16,185,129,.14)',
                    border: '1px solid rgba(16,185,129,.35)',
                    boxShadow: 'inset 0 0 24px rgba(16,185,129,.2)',
                  }}
                >
                  <Building2 className="h-7 w-7" aria-hidden />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 font-logo text-xs font-bold uppercase tracking-[.1em] text-emerald-400">
                    Para complejos
                  </div>
                  <h2
                    className="font-display font-black italic text-[#f8fafc]"
                    style={{
                      fontSize: 'clamp(28px, 3.2vw, 40px)',
                      letterSpacing: '-0.025em',
                      lineHeight: '1.02',
                    }}
                  >
                    ¿Tenés un complejo de fútbol?
                  </h2>
                  <p className="mt-3 max-w-[560px] text-base leading-[1.55] text-slate-400">
                    Gestioná tus canchas, cobrá las señas online y llená tu agenda con jugadores
                    que ya están buscando dónde jugar.
                  </p>
                </div>
              </div>

              <Link
                href="/para-complejos"
                className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-emerald-600 px-8 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500 sm:self-auto"
                style={{ boxShadow: '0 8px 30px rgba(16,185,129,.35)' }}
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
