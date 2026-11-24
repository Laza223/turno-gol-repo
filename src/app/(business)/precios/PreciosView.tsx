import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Reveal from '@/components/site/Reveal'
import CalculadoraClavo from './CalculadoraClavo'
import PlanSelector from './PlanSelector'
import { monthlyListAmount, type PricingParams } from '@/modules/billing/pricing'
import { contactWhatsappUrl } from '@/lib/contact'
import './precios.css'

const HERO_CHIPS = [
  'Empezás gratis, sin dato de pago',
  'Pago mensual o anual adelantado',
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
    t: 'Empezá gratis',
    d: 'No te pedimos ningún dato de pago. Cargás canchas y horarios en menos de 10 minutos, y si te trabás te lo dejamos andando nosotros.',
  },
  {
    n: '02',
    t: 'Compartí tu link',
    d: 'Tus clientes reservan solos a cualquier hora y el turno aparece en tu grilla. Sin que tengas que atender el teléfono.',
  },
  {
    n: '03',
    t: 'Activá el plan pago cuando te sirva',
    d: 'El plan Gratis no vence. Cuando quieras los turnos fijos, la caja y el acceso para tu encargado, podés activar el plan pago.',
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
    q: '¿Cómo se cobra el plan pago?',
    a: 'El importe depende de cuántas canchas tenés. Podés pagar mes a mes o adelantar los 12 meses con descuento. TurnoGol no cobra comisión por reserva.',
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
    q: '¿Qué incluye cada plan?',
    a: 'Gratis anotás tus turnos con nombre y teléfono, aparecés en el buscador y tus jugadores te reservan online. Con el plan pago los fijos aparecen solos en la grilla, anotás quién pagó, tenés la caja de la noche con cantina y tu encargado entra con su usuario. Si activás el plan pago y después lo dejás, lo que cargaste queda guardado. Como no te pedimos ningún dato de pago para empezar, no hay ningún cobro sorpresa.',
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

export function PreciosView({ pricing }: { pricing: PricingParams | null }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Hero />
      <Planes pricing={pricing} />
      <CuentaDelClavo pricing={pricing} />
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
          <span>Un precio para</span>
        </span>{' '}
        <span className="bz-title__line" style={{ '--l': 1 } as CSSProperties}>
          <em>tu complejo.</em>
        </span>
      </h1>
      <p className="bz-lead bz-rise" style={{ '--i': 1 } as CSSProperties}>
        El importe depende de cuántas canchas tenés.{' '}
        <strong>Sin comisión por reserva y sin sorpresas.</strong> Empezás gratis, y el plan Gratis
        no vence.
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

function Planes({ pricing }: { pricing: PricingParams | null }) {
  return (
    <section className="bz-sec">
      <div className="bz-wrap">
        <Reveal>
          {pricing ? (
            <PlanSelector pricing={pricing} />
          ) : (
            <a
              href={contactWhatsappUrl('Hola, quiero consultar el precio de TurnoGol.')}
              className={buttonVariants({ variant: 'pill', size: 'pill' })}
            >
              Consultar por WhatsApp
            </a>
          )}
        </Reveal>
      </div>
    </section>
  )
}

function CuentaDelClavo({ pricing }: { pricing: PricingParams | null }) {
  return (
    <Section>
      <SectionHead
        eyebrow="Hacé tu cuenta"
        title="¿Cuánto te cuesta el que no viene?"
        lead="Con tus números, no con los nuestros."
      />
      <Reveal delay={80}>
        {pricing && <CalculadoraClavo monthlyCents={monthlyListAmount(1, pricing)} />}
      </Reveal>
    </Section>
  )
}

function TodoIncluido() {
  return (
    <Section>
      <SectionHead
        eyebrow="Sin letra chica"
        title="Qué incluye el plan pago."
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
            <p className="bz-fine">
              No te pedimos ningún dato de pago · Lo dejás cuando quieras · Tus datos son tuyos
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'whitespace-nowrap')}
            >
              Empezar gratis
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
