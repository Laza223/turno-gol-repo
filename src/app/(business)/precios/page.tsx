import Link from 'next/link'
import { ArrowRight, CheckCircle2, ChevronDown } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import Reveal from '@/components/site/Reveal'
import CalculadoraClavo from './CalculadoraClavo'
import PlanSelector from './PlanSelector'

export const metadata = buildMetadata({
  title: 'Precios — TurnoGol para complejos de fútbol',
  description:
    'Un precio fijo por mes según cuántas canchas tenés: desde $55.000. Sin comisión por reserva, sin permanencia. 30 días gratis, sin tarjeta.',
  path: '/precios',
})

const HERO_CHIPS = ['30 días gratis, sin tarjeta', 'Mes a mes, sin permanencia', 'Sin comisión por reserva']

/** Solo features que existen en el producto (regla GTM: nada que no esté construido). */
const INCLUDED = [
  'Reservas online 24/7 con tu link propio — el jugador no baja ninguna app',
  'Señas por MercadoPago que van directo a tu cuenta',
  'El que te cuelga el turno pierde la seña; si reincide, queda 14 días sin poder reservarte online',
  'Grilla en vivo desde el celular',
  'Aviso al instante con cada reserva (de madrugada espera a las 8)',
  'Caja completa: turnos, cantina con stock, gastos y cierre diario',
  'Abonados y fijos que se repiten solos, con control de pagos',
  'Ficha de cada jugador: historial, stats y ausencias',
  'Métricas de ocupación y facturación',
  'Usuarios para tu equipo, sin límite',
  'Tus datos exportables cuando quieras',
  'Soporte directo por WhatsApp, no un 0800',
]

const STEPS = [
  {
    n: '01',
    t: 'Probalo gratis 30 días',
    d: 'Sin tarjeta. Cargás canchas y horarios en unos 20 minutos, y si te trabás te lo dejamos andando nosotros.',
  },
  {
    n: '02',
    t: 'Cobrá señas desde el primer día',
    d: 'Conectás tu MercadoPago y cada reserva online entra señada. La plata va directo a tu cuenta: nunca pasa por nosotros.',
  },
  {
    n: '03',
    t: 'Seguí solo si te sirve',
    d: 'Mes a mes, sin permanencia. Si lo dejás, exportás tus datos y no pagás nada más.',
  },
]

const FAQ = [
  {
    q: '¿Mis clientes tienen que bajarse una app?',
    a: 'No. Reservan desde un link que abre una página, como ver un menú por QR. Tus fijos y los de siempre siguen igual: los cargás vos o tu encargado en dos toques. El link es para el que te escribe a las 11 de la noche preguntando si tenés cancha.',
  },
  {
    q: '¿La seña no me espanta clientes?',
    a: 'La manejás vos: elegís el porcentaje, o la apagás y usás TurnoGol solo para ordenar la grilla y la caja. Y pensalo al revés: el que no quiere dejar ni una seña, ¿qué tan seguro está de venir?',
  },
  {
    q: '¿Qué pasa con mis fijos de toda la vida?',
    a: 'Se cargan una vez y se repiten solos todas las semanas. Ves quién pagó y quién debe, y nadie pierde su horario. El cobro lo registrás vos cuando te pagan, como siempre.',
  },
  {
    q: '¿Hay comisión por reserva o permanencia?',
    a: 'No y no. Pagás un precio fijo por mes según tus canchas. Cada reserva y cada seña van completas a tu MercadoPago. Y es mes a mes: si no te sirve, lo dejás.',
  },
  {
    q: '¿Me hace la factura? ¿Sirve para AFIP?',
    a: 'No, facturación fiscal no hace — eso sigue con tu contador, como hoy. Lo que te da es el control interno: cuánto entró, cuánto salió y por dónde.',
  },
  {
    q: '¿Y si TurnoGol cierra? ¿Qué pasa con mis datos?',
    a: 'Tus datos son tuyos y los exportás cuando quieras. La plata nunca pasa por nosotros: las señas van directo de tu cliente a tu MercadoPago. Si mañana desaparecemos, tu plata y tus clientes siguen siendo tuyos.',
  },
  {
    q: '¿Qué pasa cuando se terminan los 30 días gratis?',
    a: 'Elegís tu plan y cargás el medio de pago. Como no pedimos tarjeta para empezar, no hay ningún cobro sorpresa: si no seguís, no pagás nada y tus datos quedan disponibles 60 días por si volvés.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

export default function PreciosPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Hero />
      <Planes />
      <CuentaDelClavo />
      <TodoIncluido />
      <RiesgoCero />
      <Faq />
      <FinalCta />
    </>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-4 pt-[150px]">
      {/* KIT-GLOW-R */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[-30%] z-0 h-[640px] w-[640px] animate-tg-drift rounded-full blur-sm motion-reduce:animate-none"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.22), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-40%] left-[-12%] z-0 h-[520px] w-[520px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(5,150,105,.1), transparent 72%)' }}
      />

      <div className="relative z-10 mx-auto max-w-[880px] text-center">
        <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
          <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
          Precios claros
          <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
        </div>

        <h1
          className="mt-[18px] font-display font-black italic text-[#f8fafc]"
          style={{
            fontSize: 'clamp(38px, 4.8vw, 64px)',
            lineHeight: '0.98',
            letterSpacing: '-0.03em',
            textShadow: '0 12px 60px rgba(0,0,0,.5)',
          }}
        >
          Lo que te deja un turno,
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
            una vez al mes.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-[560px] text-slate-400" style={{ fontSize: 'clamp(15px, 1.4vw, 18px)', lineHeight: '1.55' }}>
          Eso sale TurnoGol: un precio fijo según cuántas canchas tenés.{' '}
          <span className="font-semibold text-slate-200">Sin comisión por reserva, sin permanencia, sin sorpresas.</span>{' '}
          El primer mes es gratis.
        </p>

        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[13px] text-slate-400">
          {HERO_CHIPS.map((t) => (
            <li key={t} className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Planes() {
  return (
    <section className="relative z-10 px-6 py-14 sm:py-16">
      <div className="mx-auto max-w-[1240px]">
        <Reveal>
          <PlanSelector />
        </Reveal>
      </div>
    </section>
  )
}

function CuentaDelClavo() {
  return (
    <section className="relative z-10 px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-[1080px]">
        <Reveal>
          <div className="mx-auto mb-10 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Hacé tu cuenta
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              ¿Cuánto te cuesta el que no viene?
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-slate-400">
              Con tus números, no con los nuestros.
            </p>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <CalculadoraClavo />
        </Reveal>
      </div>
    </section>
  )
}

function TodoIncluido() {
  return (
    <section className="relative z-10 px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-[1080px]">
        <Reveal>
          <div className="mx-auto mb-10 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Sin letra chica
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Todo esto, en todos los planes.
            </h2>
            <p className="mt-[14px] text-base leading-[1.55] text-slate-400">
              Ninguna función está recortada. La única diferencia entre planes es la cantidad de canchas.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
          {INCLUDED.map((item, i) => (
            <Reveal key={item} delay={Math.min(i * 40, 240)}>
              <div className="flex items-start gap-3 rounded-2xl border border-white/[.07] px-5 py-4" style={{ background: 'rgba(15,23,42,.4)' }}>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                <span className="text-[14.5px] leading-relaxed text-slate-300">{item}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function RiesgoCero() {
  return (
    <section className="relative z-10 px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-[880px]">
        <Reveal>
          <div className="mx-auto mb-10 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Riesgo cero
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Empezar no te cuesta nada.
            </h2>
          </div>
        </Reveal>
        <ol className="space-y-5">
          {STEPS.map((step, i) => (
            <li key={step.n}>
              <Reveal delay={i * 70} className="flex gap-4 rounded-2xl border border-white/[.07] p-5" style={{ background: 'rgba(15,23,42,.4)' }}>
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
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section className="relative z-10 px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-[880px]">
        <Reveal>
          <div className="mx-auto mb-10 max-w-[640px] text-center">
            <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400 whitespace-nowrap">
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
              Preguntas de vestuario
              <span className="inline-block h-[1.5px] w-[22px] rounded-[2px] bg-emerald-400" />
            </div>
            <h2
              className="mt-[14px] font-display font-black italic text-[#f8fafc]"
              style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
            >
              Lo que preguntan todos antes de arrancar.
            </h2>
          </div>
        </Reveal>
        <div className="space-y-3">
          {FAQ.map(({ q, a }, i) => (
            <Reveal key={q} delay={Math.min(i * 50, 250)}>
              <details
                className="group border border-white/9 px-6 py-5 transition-colors hover:border-emerald-400/30"
                style={{ borderRadius: '16px', background: 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))' }}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-display text-[15.5px] font-bold text-[#f8fafc] [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-emerald-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <p className="mt-3 animate-faq-in text-[14.5px] leading-relaxed text-slate-400 motion-reduce:animate-none">
                  {a}
                </p>
              </details>
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
          <h2
            className="font-display font-black italic text-[#f8fafc]"
            style={{ fontSize: 'clamp(32px, 4vw, 52px)', lineHeight: '1.02', letterSpacing: '-0.025em' }}
          >
            Empezá hoy. Gratis.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            En 20 minutos tenés la grilla andando y el link de reservas listo para mandar por WhatsApp.
            Si no te sirve, lo dejás y no pasó nada.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/5 px-6 text-xs font-bold text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.15)] transition-all duration-300 hover:bg-emerald-500/15 hover:border-emerald-400 hover:shadow-[0_0_24px_rgba(16,185,129,0.3)] active:scale-[0.97] sm:px-8 sm:text-sm whitespace-nowrap"
            >
              Empezar 30 días gratis
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden />
            </Link>
            <Link
              href="/para-complejos"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-8 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ver cómo funciona
            </Link>
          </div>
          <p className="mt-6 text-[13px] text-slate-500">Sin tarjeta · Sin permanencia · Tus datos son tuyos</p>
        </Reveal>
      </div>
    </section>
  )
}
