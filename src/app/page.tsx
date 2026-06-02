import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Search,
  Zap,
} from 'lucide-react'
import SiteNav from '@/components/site/SiteNav'
import SiteFooter from '@/components/site/SiteFooter'
import HeroSearch from '@/components/site/HeroSearch'
import FeaturedComplexCard from '@/components/site/FeaturedComplexCard'
import OpenMatchCard from '@/components/site/OpenMatchCard'
import Reveal from '@/components/site/Reveal'
import {
  listPublicCities,
  searchPublicTenants,
  type CityCount,
  type PublicTenantCard,
} from '@/modules/tenants/search.service'
import { getOpenMatches } from '@/modules/open-matches/open-match.service'
import type { OpenMatchCard as OpenMatch } from '@/modules/open-matches/open-match.types'

export const metadata = buildMetadata({
  title: 'TurnoGol — Encontrá y reservá tu cancha de fútbol',
  description:
    'Buscá complejos de fútbol cerca tuyo, mirá disponibilidad en tiempo real y reservá tu cancha online en segundos. Sin llamados, sin esperas.',
  path: '/',
  titleAbsolute: true,
})

// ISR: la landing se regenera cada 5 min (destacados + partidos abiertos frescos
// sin pegarle a la DB en cada visita). Mejor LCP/SEO que force-dynamic.
export const revalidate = 300

// Cargas resilientes: si la DB falla o está vacía, la sección no se rompe ni
// tira abajo el build (prerender ISR). Devuelven vacío y la sección se oculta.
async function loadCities(): Promise<CityCount[]> {
  try {
    return await listPublicCities()
  } catch {
    return []
  }
}

async function loadFeatured(): Promise<PublicTenantCard[]> {
  try {
    const { results } = await searchPublicTenants({ sort: 'rating', limit: 6 })
    return results
  } catch {
    return []
  }
}

async function loadOpenMatches(): Promise<OpenMatch[]> {
  try {
    const { matches } = await getOpenMatches({ status: 'open', limit: 6 })
    return matches
  } catch {
    return []
  }
}

const HERO_BG = '/hero-bg.png'

// Ciudades populares para reservar rápido (chips bajo el buscador). Linkean a
// /explorar con el filtro de ciudad ya aplicado, igual que el buscador del hero.
const POPULAR_CITIES = ['Buenos Aires', 'Córdoba', 'Mendoza', 'Rosario']

const howItWorks = [
  {
    n: '01',
    icon: Search,
    title: 'Buscá tu cancha',
    description: 'Elegí ciudad, fecha y hora. Filtrá por superficie, precio o cercanía.',
  },
  {
    n: '02',
    icon: CalendarDays,
    title: 'Elegí tu horario',
    description: 'Mirá la disponibilidad en tiempo real y elegí el turno que te sirva.',
  },
  {
    n: '03',
    icon: CheckCircle2,
    title: 'Reservá y jugá',
    description: 'Confirmá con seña online. Listo, tu cancha está reservada.',
  },
]

const playerStats = [
  { value: '+10.000', label: 'Turnos reservados' },
  { value: '50+', label: 'Complejos disponibles' },
  { value: '95%', label: 'Asistencia confirmada' },
  { value: '<2 min', label: 'Reservá en menos de' },
]

export default async function HomePage() {
  const [cities, featured, openMatches] = await Promise.all([
    loadCities(),
    loadFeatured(),
    loadOpenMatches(),
  ])

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <JsonLd data={[buildOrganization(), buildWebSite()]} />
      <SiteNav variant="overlay" />
      <Hero cities={cities} />
      {featured.length > 0 && <FeaturedComplexes complexes={featured} />}
      {openMatches.length > 0 && <OpenMatchesShowcase matches={openMatches} />}
      <HowItWorks />
      <StatsBar />
      <OwnerBanner />
      <SiteFooter />
    </div>
  )
}

function Hero({ cities }: { cities: CityCount[] }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Background image */}
      <Image
        src={HERO_BG}
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* Dark overlay + gradient */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/80 to-emerald-900/70"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent"
      />

      <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-32 text-center sm:px-6 sm:pb-32 sm:pt-40 lg:px-8 lg:pb-40 lg:pt-44">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 backdrop-blur-sm">
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Nuevo en Argentina · 2026
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
          Encontrá tu cancha y{' '}
          <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-200 bg-clip-text text-transparent">
            reservá en segundos
          </span>
          .
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300 sm:text-xl">
          Buscá complejos de fútbol cerca tuyo, mirá la disponibilidad en tiempo real y asegurá
          tu turno online. Sin llamados, sin esperas.
        </p>

        {/* Buscador — protagonista del hero (camino del jugador) */}
        <div className="mx-auto mt-10 max-w-4xl text-left">
          <HeroSearch cities={cities} />
        </div>

        {/* Ciudades populares */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-400">
            <MapPin className="h-4 w-4 text-emerald-400" aria-hidden />
            Populares:
          </span>
          {POPULAR_CITIES.map((city, i) => (
            <span key={city} className="inline-flex items-center gap-3">
              {i > 0 && (
                <span aria-hidden className="text-slate-600">
                  ·
                </span>
              )}
              <Link
                href={`/explorar?city=${encodeURIComponent(city)}`}
                className="font-medium text-slate-200 underline-offset-4 transition-colors hover:text-emerald-300 hover:underline"
              >
                {city}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturedComplexes({ complexes }: { complexes: PublicTenantCard[] }) {
  return (
    <section className="bg-slate-950 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
                Cerca tuyo
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Complejos destacados
              </h2>
              <p className="mt-3 max-w-xl text-base text-slate-400">
                Los mejor valorados de la plataforma. Mirá horarios y reservá online en segundos.
              </p>
            </div>
            <Link
              href="/explorar"
              className="group inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:self-auto"
            >
              Ver todos
              <ArrowRight
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                aria-hidden
              />
            </Link>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

function OpenMatchesShowcase({ matches }: { matches: OpenMatch[] }) {
  return (
    <section className="border-y border-white/5 bg-slate-900/40 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
              Comunidad · Falta uno
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Partidos abiertos
            </h2>
            <p className="mt-3 text-base text-slate-400">
              ¿Te falta gente o querés sumarte a un partido ya armado? Encontrá dónde jugar hoy.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((m, i) => (
            <Reveal key={m.id} delay={i * 60} className="h-full">
              <OpenMatchCard match={m} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="bg-slate-950 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
              Reservar es fácil
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Cómo funciona
            </h2>
            <p className="mt-3 text-base text-slate-400">
              De buscar a jugar en tres pasos. Sin vueltas.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6">
          {howItWorks.map((step, i) => (
            <Reveal key={step.n} delay={i * 80}>
              <div className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
                    <step.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-4xl font-extrabold tabular-nums text-white/10">
                    {step.n}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400 sm:max-w-none">
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
    <section className="border-y border-white/5 bg-slate-900/50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        {playerStats.map((s) => (
          <div key={s.label} className="bg-slate-900/50 px-4 py-8 text-center sm:px-6">
            <div className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {s.value}
            </div>
            <div className="mt-2 text-xs uppercase tracking-wide text-slate-400 sm:text-sm">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function OwnerBanner() {
  return (
    <section className="bg-slate-950 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-900/30 via-slate-900/60 to-slate-900/60 px-6 py-10 sm:px-10 sm:py-12">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.18),_transparent_60%)]"
            />
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
                  <Building2 className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  ¿Tenés un complejo de fútbol?
                </h2>
                <p className="mt-3 text-base text-slate-300">
                  Gestioná tus canchas, cobrá online y llená tu agenda con TurnoGol.
                </p>
              </div>
              <Link
                href="/para-complejos"
                className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white shadow-xl shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-400 sm:self-auto"
              >
                Conocé más
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
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
