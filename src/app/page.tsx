import { buildMetadata } from '@/lib/seo/metadata'
import JsonLd from '@/components/seo/JsonLd'
import { buildOrganization, buildWebSite } from '@/lib/seo/structured-data'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  CreditCard,
  LineChart,
  Quote,
  Shield,
  Star,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import SiteNav from '@/components/site/SiteNav'
import SiteFooter from '@/components/site/SiteFooter'

export const metadata = buildMetadata({
  title: 'TurnoGol — Reservá tu cancha de fútbol',
  description: 'Encontrá complejos de fútbol cerca tuyo y reservá tu cancha online en segundos. Sin llamados, sin esperas.',
  path: '/',
  titleAbsolute: true,
})

const HERO_BG = '/hero-bg.png'
const FEATURE_BG =
  'https://images.unsplash.com/photo-1486286701208-1d58e9338013?q=80&w=2000&auto=format&fit=crop'

const features = [
  {
    icon: Calendar,
    title: 'Reservas online 24/7',
    description:
      'Tus jugadores reservan desde el celular. Vos dormís, el complejo trabaja.',
  },
  {
    icon: CreditCard,
    title: 'Cobros automáticos con MercadoPago',
    description:
      'Seña al confirmar la reserva. Sin perseguir pagos ni esperar transferencias.',
  },
  {
    icon: LineChart,
    title: 'Dashboard en tiempo real',
    description:
      'Caja, ocupación y reservas del día en una sola pantalla. Decidí con datos.',
  },
  {
    icon: Bell,
    title: 'Recordatorios automáticos',
    description:
      'Email 24 hs antes del turno. Menos ausencias, más canchas llenas.',
  },
  {
    icon: Wallet,
    title: 'Caja unificada',
    description:
      'Reservas, cantina y abonados en un único cierre diario. Cero planilla Excel.',
  },
  {
    icon: Users,
    title: 'Abonados y partidos fijos',
    description:
      'Lunes 21 hs, martes 22 hs… programado y cobrado solo. El cliente fiel paga primero.',
  },
]

const stats = [
  { value: '+10.000', label: 'Turnos gestionados' },
  { value: '95%', label: 'Menos ausencias' },
  { value: '50+', label: 'Complejos activos' },
  { value: '<2 min', label: 'Onboarding promedio' },
]

const testimonials = [
  {
    name: 'Marcelo Pérez',
    role: 'Dueño · Complejo San Martín',
    city: 'Mendoza',
    quote:
      'Pasamos de un cuaderno a 6 canchas con reservas 24/7. Subimos la facturación 40% en tres meses sin contratar a nadie.',
  },
  {
    name: 'Lucía Fernández',
    role: 'Encargada · Predio La Pasión',
    city: 'Córdoba',
    quote:
      'Las ausencias bajaron casi a cero gracias a la seña automática. Antes perdíamos 4 turnos por noche.',
  },
  {
    name: 'Gonzalo Ramírez',
    role: 'Dueño · Estadio Norte',
    city: 'Buenos Aires',
    quote:
      'Cierro la caja en 30 segundos. La grilla en tiempo real me ahorra discusiones con el equipo.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <JsonLd data={[buildOrganization(), buildWebSite()]} />
      <SiteNav variant="overlay" />
      <Hero />
      <StatsBar />
      <Features />
      <ShowcaseStrip />
      <Testimonials />
      <FinalCta />
      <SiteFooter />
    </div>
  )
}

function Hero() {
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

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-32 sm:px-6 sm:pb-32 sm:pt-40 lg:px-8 lg:pb-40 lg:pt-48">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Nuevo en Argentina · 2026
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Tu complejo de fútbol,{' '}
            <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-200 bg-clip-text text-transparent">
              lleno todos los días
            </span>
            .
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-300 sm:text-xl">
            La plataforma que reemplaza tu cuaderno y tu WhatsApp. Reservas online,
            cobros automáticos con MercadoPago y la grilla en tiempo real. Hecho 100%
            para complejos de fútbol argentinos.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/register"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-emerald-500/40 transition-all duration-300"
            >
              Comenzá gratis 30 días
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/10 transition-colors duration-150"
            >
              Iniciar sesión
            </Link>
          </div>
          <ul className="mt-10 flex flex-col gap-3 text-sm text-slate-300 sm:flex-row sm:gap-8">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              Sin tarjeta de crédito
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              Configuración en menos de 2 minutos
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              Soporte por email
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}

function StatsBar() {
  return (
    <section className="border-y border-white/5 bg-slate-900/50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        {stats.map((s) => (
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

function Features() {
  return (
    <section id="features" className="bg-slate-950 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
            Todo lo que necesitás
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Pensado para llenar canchas, no para llenar planillas.
          </h2>
          <p className="mt-6 text-lg text-slate-400">
            Cada función arranca de un dolor real de tu complejo. Sin features que nunca usás.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-2xl hover:shadow-emerald-500/10"
            >
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-400/30 group-hover:bg-emerald-500/20 transition-colors">
                <f.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ShowcaseStrip() {
  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src={FEATURE_BG}
        alt=""
        aria-hidden
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/40"
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-32">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
            Onboarding
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            En 4 pasos estás recibiendo reservas online.
          </h2>
          <ol className="mt-10 space-y-5">
            {[
              { n: '01', t: 'Creá tu cuenta', d: 'Email + nombre. Magic link, sin contraseñas.' },
              { n: '02', t: 'Cargá tus canchas', d: 'Nombre, superficie, capacidad. En segundos.' },
              { n: '03', t: 'Definí horarios y precios', d: 'Por franja, por día, como quieras.' },
              { n: '04', t: 'Conectá MercadoPago', d: 'OAuth en un click. Empezás a cobrar señas.' },
            ].map((step) => (
              <li key={step.n} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">{step.t}</h3>
                  <p className="mt-1 text-sm text-slate-400">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-xs text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-auto font-mono">grilla.turnogol.com.ar</span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
              {[...Array(20)].map((_, i) => {
                const filled = [1, 2, 5, 7, 8, 11, 14, 17, 18].includes(i)
                const next = [3, 9, 15].includes(i)
                return (
                  <div
                    key={i}
                    className={[
                      'h-12 rounded-md flex items-center justify-center font-medium tabular-nums',
                      filled
                        ? 'bg-emerald-500/30 text-emerald-100 ring-1 ring-inset ring-emerald-400/40'
                        : next
                          ? 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-300/30'
                          : 'bg-white/[0.03] text-slate-500 ring-1 ring-inset ring-white/5',
                    ].join(' ')}
                  >
                    {(18 + Math.floor(i / 4)).toString().padStart(2, '0')}
                    :{((i % 4) * 15).toString().padStart(2, '0')}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-slate-400">9 reservas confirmadas hoy</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                En vivo
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Testimonials() {
  return (
    <section id="testimonios" className="bg-slate-950 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
            Historias reales
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Complejos que ya cambiaron el cuaderno.
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="group relative flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40"
            >
              <Quote className="absolute right-6 top-6 h-8 w-8 text-emerald-400/20" aria-hidden />
              <div className="flex gap-0.5 text-amber-300">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-200">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-6 border-t border-white/10 pt-4">
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-xs text-slate-400">{t.role}</div>
                <div className="text-xs text-slate-500">{t.city}, Argentina</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden bg-slate-950">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.20),_transparent_60%)]"
      />
      <div className="relative mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 sm:py-32 lg:px-8">
        <Shield className="mx-auto mb-6 h-10 w-10 text-emerald-400" aria-hidden />
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
          Tu próxima reserva online empieza hoy.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
          Probá TurnoGol 30 días gratis. Sin tarjeta. Sin permanencia. Si no te sirve, lo dejás.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-8 text-sm font-semibold text-white shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 hover:-translate-y-0.5 transition-all duration-300"
          >
            Crear mi cuenta
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 px-8 text-sm font-semibold text-white hover:bg-white/5 transition-colors duration-150"
          >
            Ya tengo cuenta
          </Link>
        </div>
      </div>
    </section>
  )
}

