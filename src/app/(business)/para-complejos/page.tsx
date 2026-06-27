import Link from 'next/link'
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
import { buildMetadata } from '@/lib/seo/metadata'
import Reveal from '@/components/site/Reveal'

export const metadata = buildMetadata({
  title: 'TurnoGol para complejos — Gestión y reservas online para tu cancha',
  description:
    'El software de gestión hecho para complejos de fútbol argentinos. Reservas online 24/7, cobros automáticos con MercadoPago y la grilla en tiempo real. Probá 30 días gratis, sin tarjeta.',
  path: '/para-complejos',
})

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
    title: 'Avisos al instante',
    description:
      'Push al admin apenas entra una reserva online. En la madrugada se agenda para las 8 AM: no suena de noche.',
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

export default function ParaComplejosPage() {
  return (
    <>
      <Hero />
      <Features />
      <StatsBar />
      <ShowcaseStrip />
      <Testimonials />
      <FinalCta />
    </>
  )
}

function Hero() {
  return (
    <section className="relative flex min-h-[84vh] items-center overflow-hidden px-6 py-[60px] pb-[84px]">
      {/* KIT-HEROBG */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-30"
        style={{
          backgroundImage: "url('/hero-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          transform: 'scale(1.05)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* KIT-GLOW-R */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-6%] top-[-10%] z-0 h-[760px] w-[760px] animate-tg-drift rounded-full blur-[8px] motion-reduce:animate-none"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.28), transparent 70%)' }}
      />
      {/* KIT-GLOW-L */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] z-0 h-[620px] w-[620px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(5,150,105,.12), transparent 72%)' }}
      />
      {/* KIT-PARTICLE x2 */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[8%] top-[24%] z-0 h-[6px] w-[6px] animate-tg-float rounded-full bg-emerald-400 motion-reduce:hidden"
        style={{ boxShadow: '0 0 16px 4px rgba(52,211,153,.6)' }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[18%] right-[40%] z-0 h-[5px] w-[5px] rounded-full bg-emerald-300 motion-reduce:hidden"
        style={{ boxShadow: '0 0 14px 3px rgba(110,231,183,.55)', animation: 'tg-float 10s ease-in-out infinite 0.8s' }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1240px] grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="min-w-0">
          {/* KIT-PILL-LIVE */}
          <div
            className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-[#6ee7b7] backdrop-blur-sm"
            style={{ boxShadow: 'inset 0 0 30px rgba(16,185,129,.14)', whiteSpace: 'nowrap' }}
          >
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Para dueños y encargados
          </div>

          <h1
            className="mt-[22px] font-display font-black italic text-[#f8fafc]"
            style={{
              fontSize: 'clamp(44px, 5.2vw, 74px)',
              lineHeight: '0.95',
              letterSpacing: '-0.035em',
              textShadow: '0 12px 60px rgba(0,0,0,.5)',
            }}
          >
            Tu complejo de fútbol,
            <br />
            <span
              style={{
                background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              lleno todos los días.
            </span>
          </h1>

          <p className="mt-6 max-w-[540px] text-slate-400" style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: '1.55' }}>
            La plataforma que reemplaza tu cuaderno y tu WhatsApp. Reservas online,
            cobros automáticos con MercadoPago y la grilla en tiempo real.{' '}
            <span className="font-semibold text-slate-200">Hecho 100% para complejos de fútbol argentinos.</span>
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/register"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
              style={{ boxShadow: '0 8px 30px rgba(16,185,129,.35)' }}
            >
              Empezar gratis
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ingresar
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-slate-400">
            {['Sin tarjeta de crédito', 'Configuración en menos de 2 minutos', 'Soporte por email'].map((t) => (
              <li key={t} className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <PanelMockup />
      </div>
    </section>
  )
}

const PANEL_SLOTS = [
  { time: '18', state: 'occupied' },
  { time: '19', state: 'free' },
  { time: '20', state: 'occupied' },
  { time: '21', state: 'new' },
  { time: '22', state: 'occupied' },
  { time: '23', state: 'free' },
] as const

function PanelMockup() {
  return (
    <div className="relative hidden min-w-0 lg:block" aria-hidden>
      {/* Glow detrás */}
      <div
        className="pointer-events-none absolute inset-[6%_8%] rounded-[28px] blur-[30px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.3), transparent 75%)' }}
      />
      {/* Card */}
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(15,23,42,.86), rgba(2,6,23,.92))',
          border: '1px solid rgba(255,255,255,.1)',
          boxShadow: '0 0 70px rgba(16,185,129,.21), 0 50px 90px -40px rgba(0,0,0,.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'tg-float 9s ease-in-out infinite',
        }}
      >
        {/* Header del panel */}
        <div className="flex items-center justify-between border-b border-white/[.08] px-[22px] py-[16px]">
          <div>
            <div className="font-logo text-[11px] uppercase tracking-[.06em] text-slate-500">Panel · Hoy</div>
            <div className="font-display font-bold text-[18px] text-[#f8fafc]">Grilla en vivo</div>
          </div>
          <div
            className="inline-flex items-center gap-[7px] rounded-full px-3 py-[6px] text-[11px] font-bold uppercase tracking-[.08em] text-[#6ee7b7]"
            style={{ background: 'rgba(2,6,23,.6)', border: '1px solid rgba(16,185,129,.45)' }}
          >
            <span className="relative flex h-[7px] w-[7px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-emerald-400" />
            </span>
            En vivo
          </div>
        </div>

        <div className="p-[22px]">
          {/* Slots */}
          <div className="mb-[10px] flex items-center justify-between">
            <span className="font-logo text-[12px] font-bold uppercase tracking-[.06em] text-slate-500">Cancha 1 · Turnos</span>
            <span className="text-[12px] font-semibold text-emerald-400">2 libres</span>
          </div>
          <div className="grid grid-cols-3 gap-[9px]">
            {PANEL_SLOTS.map(({ time, state }) => (
              <div
                key={time}
                className="flex flex-col items-center gap-[2px] rounded-[12px] px-1 py-[11px]"
                style={
                  state === 'new'
                    ? {
                        background: 'linear-gradient(160deg, #10b981, #059669)',
                        border: '1px solid #34d399',
                        boxShadow: '0 0 22px rgba(16,185,129,.55), inset 0 1px 0 rgba(255,255,255,.3)',
                      }
                    : state === 'free'
                      ? { background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.32)' }
                      : { background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', opacity: '0.55' }
                }
              >
                <span
                  className={`font-logo font-bold text-[15px] ${
                    state === 'new' ? 'text-white' : state === 'free' ? 'text-[#6ee7b7]' : 'text-slate-500'
                  }`}
                >
                  {time}:00
                </span>
                <span
                  className={`text-[10px] uppercase tracking-[.04em] ${
                    state === 'new' ? 'text-[#d1fae5]' : state === 'free' ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                >
                  {state === 'new' ? 'Nueva' : state === 'free' ? 'Libre' : 'Ocupado'}
                </span>
              </div>
            ))}
          </div>

          {/* Fila caja del día */}
          <div className="mt-[18px] flex items-center justify-between gap-3 border-t border-white/[.08] pt-[16px]">
            <div>
              <div className="font-logo text-[11px] uppercase tracking-[.05em] text-slate-500">Caja del día</div>
              <div className="font-display font-bold text-[20px] text-[#f8fafc]">$184.500</div>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-xl px-4 py-[10px] text-[13px] font-semibold text-[#6ee7b7]"
              style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)' }}
            >
              9 reservas hoy
            </div>
          </div>
        </div>
      </div>

      {/* Toast "Nueva reserva online" */}
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
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-emerald-400" style={{ background: 'rgba(16,185,129,.18)' }}>
          <Bell className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <div className="text-[13px] font-bold text-[#f1f5f9]">Nueva reserva online</div>
          <div className="text-[11px] text-slate-500">hace 1 minuto</div>
        </div>
      </div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="relative z-10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Todo lo que necesitás
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(32px, 4vw, 50px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Pensado para llenar canchas, no planillas.
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-slate-400">
              Cada función arranca de un dolor real de tu complejo. Sin features que nunca usás.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="h-full">
              <div
                className="group relative h-full overflow-hidden border border-white/[.09] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40"
                style={{ borderRadius: '20px', background: 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))' }}
              >
                <div
                  className="relative inline-flex h-[52px] w-[52px] items-center justify-center text-emerald-400"
                  style={{
                    borderRadius: '14px',
                    background: 'rgba(16,185,129,.12)',
                    border: '1px solid rgba(16,185,129,.3)',
                    boxShadow: 'inset 0 0 20px rgba(16,185,129,.15)',
                  }}
                >
                  <f.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="relative mt-5 font-display font-bold text-xl text-[#f8fafc]">{f.title}</h3>
                <p className="relative mt-2.5 text-[14.5px] leading-[1.6] text-slate-400">{f.description}</p>
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
    <section className="relative z-10 py-6">
      <div className="mx-auto max-w-[1240px] px-6">
        <div
          className="relative overflow-hidden rounded-3xl border border-emerald-500/[.22] p-11"
          style={{
            background: 'linear-gradient(120deg, rgba(6,78,59,.55), rgba(2,6,23,.35) 55%, rgba(6,78,59,.4))',
            boxShadow: '0 0 70px rgba(16,185,129,.165), inset 0 1px 0 rgba(255,255,255,.06)',
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-40%] h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-[20px]"
            style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.3), transparent 72%)' }}
          />
          <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.label} className={`text-center ${i > 0 ? 'border-l border-white/10' : ''}`}>
                <div
                  className="font-display font-black italic leading-none"
                  style={{
                    fontSize: 'clamp(36px, 4.6vw, 56px)',
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

function ShowcaseStrip() {
  const steps = [
    { n: '01', t: 'Creá tu cuenta', d: 'Email, nombre y contraseña. Confirmás el email y listo.' },
    { n: '02', t: 'Cargá tus canchas', d: 'Nombre, superficie, capacidad. En segundos.' },
    { n: '03', t: 'Definí horarios y precios', d: 'Por franja, por día, como quieras.' },
    { n: '04', t: 'Conectá MercadoPago', d: 'OAuth en un click. Empezás a cobrar señas.' },
  ]
  return (
    <section className="relative z-10 overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1] opacity-[0.10] mix-blend-luminosity"
        style={{
          backgroundImage: `url('${FEATURE_BG}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          maskImage: 'linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent)',
        }}
      />
      <div className="relative mx-auto grid max-w-[1240px] gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div>
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Onboarding
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(30px, 3.4vw, 44px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              En 4 pasos estás recibiendo reservas online.
            </h2>
            <ol className="mt-10 space-y-5">
              {steps.map((step) => (
                <li key={step.n} className="flex gap-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] font-logo text-sm font-bold text-emerald-400"
                    style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', boxShadow: 'inset 0 0 16px rgba(16,185,129,.15)' }}
                  >
                    {step.n}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold text-[#f8fafc]">{step.t}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div
            className="relative overflow-hidden p-6"
            style={{
              borderRadius: '20px',
              background: 'linear-gradient(180deg, rgba(15,23,42,.78), rgba(2,6,23,.9))',
              border: '1px solid rgba(255,255,255,.1)',
              boxShadow: '0 0 60px rgba(16,185,129,.16), 0 40px 80px -40px rgba(0,0,0,.9)',
            }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-xs text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-auto font-mono text-[11px] text-slate-500">app.turnogol.app/grilla</span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
              {[...Array(20)].map((_, i) => {
                const filled = [1, 2, 5, 7, 8, 11, 14, 17, 18].includes(i)
                const next = [3, 9, 15].includes(i)
                return (
                  <div
                    key={i}
                    className={[
                      'flex h-12 items-center justify-center rounded-md font-logo font-medium tabular-nums',
                      filled
                        ? 'bg-emerald-500/30 text-emerald-100 ring-1 ring-inset ring-emerald-400/40'
                        : next
                          ? 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-300/30'
                          : 'bg-white/[0.03] text-slate-500 ring-1 ring-inset ring-white/5',
                    ].join(' ')}
                  >
                    {(18 + Math.floor(i / 4)).toString().padStart(2, '0')}:{((i % 4) * 15).toString().padStart(2, '0')}
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
        </Reveal>
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
            Empezar gratis
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 px-8 text-sm font-semibold text-white hover:bg-white/5 transition-colors duration-150"
          >
            Ingresar
          </Link>
        </div>
      </div>
    </section>
  )
}
