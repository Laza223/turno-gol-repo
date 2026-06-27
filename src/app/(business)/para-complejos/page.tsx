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
  title: 'TurnoGol para complejos — La plataforma que llena canchas',
  description:
    'Gestión integral para complejos de fútbol. Reservas online 24/7, cobros automáticos con MercadoPago, grilla en tiempo real y acceso a miles de jugadores. 30 días gratis.',
  path: '/para-complejos',
})

const FEATURE_BG =
  'https://images.unsplash.com/photo-1486286701208-1d58e9338013?q=80&w=2000&auto=format&fit=crop'

const features = [
  {
    icon: Calendar,
    title: 'Reservas online 24/7',
    description:
      'Tus canchas reciben reservas las 24 horas, los 7 días. Tu complejo genera ingresos incluso mientras dormís.',
  },
  {
    icon: CreditCard,
    title: 'Cobros automáticos con MercadoPago',
    description:
      'La seña se cobra automáticamente al confirmar la reserva. Eliminá la persecución de pagos y las transferencias pendientes.',
  },
  {
    icon: LineChart,
    title: 'Dashboard en tiempo real',
    description:
      'Facturación, ocupación y reservas del día en una sola vista. Tomá decisiones basadas en datos reales.',
  },
  {
    icon: Bell,
    title: 'Avisos al instante',
    description:
      'Notificación instantánea con cada nueva reserva. Las reservas nocturnas se notifican a las 8 AM para no interrumpir tu descanso.',
  },
  {
    icon: Wallet,
    title: 'Caja unificada',
    description:
      'Reservas, cantina y abonados unificados en un solo cierre diario. Olvidate de las planillas.',
  },
  {
    icon: Users,
    title: 'Abonados y partidos fijos',
    description:
      'Turnos fijos programados y cobrados automáticamente. Tus clientes recurrentes siempre tienen su horario asegurado.',
  },
]

const stats = [
  { value: '+10.000', label: 'Reservas gestionadas' },
  { value: '95%', label: 'Reducción de ausencias' },
  { value: '50+', label: 'Complejos en la plataforma' },
  { value: '<2 min', label: 'Tiempo de configuración' },
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
    <section className="relative flex min-h-[84vh] items-center overflow-hidden px-6 pt-[120px] pb-[84px]">
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
            Tu complejo, siempre lleno.
            <br />
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
              Reservas que no paran.
            </span>
          </h1>

          <p className="mt-6 max-w-[540px] text-slate-400" style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: '1.55' }}>
            La plataforma que automatiza reservas, elimina ausencias y maximiza tu ocupación.
            Cobros con MercadoPago, grilla en tiempo real y acceso directo a miles de jugadores.{' '}
            <span className="font-semibold text-slate-200">Diseñada específicamente para complejos de fútbol en Argentina.</span>
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
            {['Sin tarjeta de crédito', 'Configuración en menos de 2 minutos', 'Soporte dedicado'].map((t) => (
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
        className="relative overflow-hidden animate-[tg-float_9s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(15,23,42,.86), rgba(2,6,23,.92))',
          border: '1px solid rgba(255,255,255,.1)',
          boxShadow: '0 0 70px rgba(16,185,129,.21), 0 50px 90px -40px rgba(0,0,0,.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
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
              <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-emerald-400 opacity-75" />
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
        className="absolute -left-[26px] bottom-9 inline-flex items-center gap-[9px] rounded-[14px] p-[10px_14px] animate-[tg-float_7s_ease-in-out_infinite_1.4s] motion-reduce:animate-none"
        style={{
          background: 'rgba(8,15,32,.88)',
          border: '1px solid rgba(255,255,255,.12)',
          boxShadow: '0 18px 40px -18px rgba(0,0,0,.9)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
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
              Funcionalidades que generan resultados
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(32px, 4vw, 50px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Cada función está diseñada para aumentar tu ocupación.
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-slate-400">
              Herramientas que nacieron de la operación diaria de complejos como el tuyo. Todo lo que necesitás, nada que sobre.
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
    { n: '01', t: 'Creá tu cuenta', d: 'Email, nombre y contraseña. Confirmación por email y estás dentro.' },
    { n: '02', t: 'Registrá tus canchas', d: 'Nombre, tipo de superficie y capacidad. En menos de un minuto.' },
    { n: '03', t: 'Definí horarios y tarifas', d: 'Personalizá por franja horaria, por día o como mejor se adapte a tu operación.' },
    { n: '04', t: 'Conectá MercadoPago', d: 'Integración en un click. Empezá a recibir señas automáticas.' },
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
              Configuración express
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(30px, 3.4vw, 44px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              En 4 pasos tu complejo empieza a recibir reservas online.
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
    <section id="testimonios" className="relative z-10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-6">
        <Reveal>
          <div className="mx-auto mb-12 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Lo que dicen nuestros complejos
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(32px, 4vw, 50px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Resultados que hablan por sí solos.
            </h2>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-[22px] md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 70} className="h-full">
              <figure
                className="group relative flex h-full flex-col overflow-hidden border border-white/[.09] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40"
                style={{ borderRadius: '20px', background: 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))' }}
              >
                <Quote className="absolute right-6 top-6 h-8 w-8 text-emerald-400/20" aria-hidden />
                <div className="flex gap-0.5 text-amber-300">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" aria-hidden />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-200">&quot;{t.quote}&quot;</blockquote>
                <figcaption className="mt-6 border-t border-white/10 pt-4">
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-slate-400">{t.role}</div>
                  <div className="text-xs text-slate-500">{t.city}, Argentina</div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative z-10 overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[-1]"
        style={{ background: 'radial-gradient(ellipse at top, rgba(16,185,129,.20), transparent 60%)' }}
      />
      <div className="relative mx-auto max-w-[900px] px-6 text-center">
        <Reveal>
          <div
            className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center text-emerald-400"
            style={{ borderRadius: '16px', background: 'rgba(16,185,129,.14)', border: '1px solid rgba(16,185,129,.35)', boxShadow: 'inset 0 0 24px rgba(16,185,129,.2)' }}
          >
            <Shield className="h-7 w-7" aria-hidden />
          </div>
          <h2
            className="font-display font-black italic text-[#f8fafc]"
            style={{ fontSize: 'clamp(32px, 4vw, 52px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
          >
            Tu complejo merece funcionar al máximo.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Probá TurnoGol durante 30 días sin costo. Sin tarjeta de crédito, sin compromiso. Si no ves resultados, lo dejás.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-8 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
              style={{ boxShadow: '0 8px 30px rgba(16,185,129,.35)' }}
            >
              Empezar gratis
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-8 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ingresar
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
