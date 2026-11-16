import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { formatArs } from '@/lib/format'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Reveal from '@/components/site/Reveal'
import CalculadoraClavo from './CalculadoraClavo'
import PlanSelector from './PlanSelector'
import { PLANS } from './plans-data'
import './precios.css'

// La base pública sale del mismo catálogo que la calculadora.
export const metadata = buildMetadata({
  title: 'Precios — TurnoGol para complejos de fútbol',
  description: `Plan Gratis para aparecer donde buscan cancha, y Completo a ${formatArs(PLANS[0]!.priceMonthly)} por cancha al mes. Sin comisión por reserva, sin permanencia. 30 días de Completo gratis, sin tarjeta.`,
  path: '/precios',
})

const HERO_CHIPS = [
  '30 días de Completo gratis, sin tarjeta',
  'Mes a mes, sin permanencia',
  'Sin comisión por reserva',
]

/** Solo features que existen en el producto (regla GTM: nada que no esté construido). */
const INCLUDED = [
  'Reservas online 24/7 con tu link propio — el jugador no baja ninguna app',
  'Grilla en vivo desde el celular',
  'Aviso al instante con cada reserva (de madrugada espera a las 8)',
  'Caja completa: turnos, cantina con stock, gastos y cierre diario',
  'Abonados y fijos que se repiten solos, con control de pagos',
  'Ficha de cada jugador: historial, stats y ausencias',
  'Métricas de ocupación y facturación',
  'Usuarios para tu equipo, sin límite',
  'Tus datos exportables cuando quieras',
  'Soporte directo por WhatsApp, no un 0800',
  'El que reserva online y no viene, si reincide, queda 14 días sin poder reservarte',
  'Si querés, seña online (viene apagada): la prendés vos y lo que cobrás va directo a vos',
]

const STEPS = [
  {
    n: '01',
    t: 'Probalo gratis 30 días',
    d: 'Sin tarjeta. Cargás canchas y horarios en menos de 10 minutos, y si te trabás te lo dejamos andando nosotros.',
  },
  {
    n: '02',
    t: 'Compartí tu link',
    d: 'Tus clientes reservan solos a cualquier hora y el turno aparece en tu grilla. Sin que tengas que atender el teléfono.',
  },
  {
    n: '03',
    t: 'Seguí solo si te sirve',
    d: 'Mes a mes, sin permanencia. Si no pagás, quedás en el plan Gratis: seguís apareciendo y tus jugadores te siguen reservando online.',
  },
]

const FAQ = [
  {
    q: '¿Mis clientes tienen que bajarse una app?',
    a: 'No. Reservan desde un link que abre una página, como ver un menú por QR. Tus fijos y los de siempre siguen igual: los cargás vos o tu encargado en dos toques. El link es para el que te escribe a las 11 de la noche preguntando si tenés cancha.',
  },
  {
    q: '¿Tengo que cobrar seña?',
    a: 'No. Viene apagada y TurnoGol funciona igual: reservas, grilla y caja. Si algún día querés, la prendés y elegís el porcentaje.',
  },
  {
    q: '¿Qué pasa con mis fijos de toda la vida?',
    a: 'Se cargan una vez y se repiten solos todas las semanas. Ves quién pagó y quién debe, y nadie pierde su horario. El cobro lo registrás vos cuando te pagan, como siempre.',
  },
  {
    q: '¿Hay comisión por reserva o permanencia?',
    a: 'No y no. Pagás un precio fijo por mes según tus canchas. Lo que cobrás va directo a vos, completo. Y es mes a mes: si no te sirve, lo dejás.',
  },
  {
    q: '¿Me hace la factura? ¿Sirve para AFIP?',
    a: 'No, facturación fiscal no hace — eso sigue con tu contador, como hoy. Lo que te da es el control interno: cuánto entró, cuánto salió y por dónde.',
  },
  {
    q: '¿Y si TurnoGol cierra? ¿Qué pasa con mis datos?',
    a: 'Tus datos son tuyos y los exportás cuando quieras. La plata nunca pasa por nosotros: lo que cobrás va directo a vos. Si mañana desaparecemos, tu plata y tus clientes siguen siendo tuyos.',
  },
  {
    q: '¿Qué pasa cuando se terminan los 30 días gratis?',
    a: 'Si activás Completo, seguís igual. Si no, pasás al plan Gratis: seguís en el buscador y tus jugadores te reservan online, hasta 20 turnos por mes. Tus fijos, tu caja y tus jugadores quedan guardados para cuando vuelvas. Como no pedimos tarjeta para empezar, no hay ningún cobro sorpresa.',
  },
  {
    q: '¿El plan Gratis vence?',
    a: 'No. Mientras lo uses, sigue. Si pasan 6 meses sin que entres al panel ni te lleguen reservas, te avisamos por mail y, si no volvés, borramos la cuenta a los 90 días. Las condiciones del Gratis pueden cambiar, siempre con 30 días de aviso.',
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

/** Cabecera de cada sección: eyebrow en verde de lugar, título y, si hay, la bajada. */
function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <Reveal>
      <div className="bz-head">
        <p className="bz-eyebrow">{eyebrow}</p>
        <h2 className="bz-h2">{title}</h2>
        {lead && <p className="bz-lead2">{lead}</p>}
      </div>
    </Reveal>
  )
}

function Section({ children, wide = true }: { children: ReactNode; wide?: boolean }) {
  return (
    <section className="bz-sec">
      <div className={wide ? 'bz-wrap' : 'bz-wrap bz-wrap--m'}>{children}</div>
    </section>
  )
}

function Hero() {
  return (
    <section className="bz-hero bz-hero--short">
      <p className="bz-eyebrow bz-rise">Precios claros</p>
      <h1 className="bz-title">
        <span className="bz-title__line" style={{ '--l': 0 } as CSSProperties}>
          <span>Lo que te deja un turno,</span>
        </span>{' '}
        <span className="bz-title__line" style={{ '--l': 1 } as CSSProperties}>
          <em>una vez al mes.</em>
        </span>
      </h1>
      <p className="bz-lead bz-rise" style={{ '--i': 1 } as CSSProperties}>
        Eso sale Completo: un precio fijo según cuántas canchas tenés.{' '}
        <strong>Sin comisión por reserva, sin permanencia, sin sorpresas.</strong> El primer mes es
        gratis, y si no seguís, quedás en el plan Gratis.
      </p>
      <ul className="bz-feats bz-rise justify-center" style={{ '--i': 2 } as CSSProperties}>
        {HERO_CHIPS.map((t) => (
          <li key={t} className="bz-feat">
            <Check aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Planes() {
  return (
    <section className="bz-sec">
      <div className="bz-wrap">
        <Reveal>
          <PlanSelector />
        </Reveal>
      </div>
    </section>
  )
}

function CuentaDelClavo() {
  return (
    <Section>
      <SectionHead
        eyebrow="Hacé tu cuenta"
        title="¿Cuánto te cuesta el que no viene?"
        lead="Con tus números, no con los nuestros."
      />
      <Reveal delay={80}>
        <CalculadoraClavo />
      </Reveal>
    </Section>
  )
}

function TodoIncluido() {
  return (
    <Section>
      <SectionHead
        eyebrow="Sin letra chica"
        title="Todo esto viene en Completo."
        lead="Para todas tus canchas. Pagás por la cantidad exacta de canchas."
      />
      <Reveal>
        <div className="glass-painted rounded-[32px] p-6 sm:p-8">
          <ul className="bz-ticks pr-ticks2">
            {INCLUDED.map((item) => (
              <li key={item}>
                <Check aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </Section>
  )
}

function RiesgoCero() {
  return (
    <Section>
      <SectionHead eyebrow="Riesgo cero" title="Empezar no te cuesta nada." />
      <Reveal>
        <ol className="pr-trio">
          {STEPS.map((step) => (
            <li key={step.n} className="glass-painted">
              <i>{step.n}</i>
              <h3>{step.t}</h3>
              <p>{step.d}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  )
}

function Faq() {
  return (
    <Section wide={false}>
      <SectionHead
        eyebrow="Preguntas de vestuario"
        title="Lo que preguntan todos antes de arrancar."
      />
      <div className="pr-faq">
        {FAQ.map(({ q, a }, i) => (
          <Reveal key={q} delay={Math.min(i * 50, 250)}>
            <details className="pr-qa glass-painted">
              <summary>
                {q}
                <ChevronDown aria-hidden />
              </summary>
              <p>{a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

function FinalCta() {
  return (
    <Section>
      <Reveal>
        <div className="bz-cta glass-painted">
          <div>
            <h2 className="bz-h2">Empezá hoy. Gratis.</h2>
            <p className="bz-lead2">
              En menos de 10 minutos tenés la grilla andando y el link de reservas listo para mandar
              por WhatsApp. Si no te sirve, lo dejás y no pasó nada.
            </p>
            <p className="bz-fine">Sin tarjeta · Sin permanencia · Tus datos son tuyos</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'whitespace-nowrap')}
            >
              Empezar 30 días gratis
              <ArrowRight aria-hidden />
            </Link>
            <Link
              href="/para-complejos"
              className={cn(
                buttonVariants({ variant: 'pill-glass', size: 'pill' }),
                'whitespace-nowrap',
              )}
            >
              Ver cómo funciona
            </Link>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
