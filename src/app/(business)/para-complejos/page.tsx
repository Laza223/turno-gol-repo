import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { buttonVariants } from '@/components/ui/button'
import { contactWhatsappUrl } from '@/lib/contact'
import { HOLD_TTL_SECONDS } from '@/lib/booking/hold'
import { NO_SHOW_CONSEQUENCES } from '@/lib/booking/no-show-consequences'
import { TRIAL_DAYS } from '@/shared/constants'
import { cn } from '@/lib/utils'
import HoldClock from './HoldClock'
import { GridFragment, MoneyFragment, PageLinkFragment, SenaPhone } from './fragments'

export const metadata = buildMetadata({
  title: 'TurnoGol para complejos — El sistema de señas para canchas de fútbol',
  titleAbsolute: true,
  description: `El jugador reserva desde la página de tu complejo y paga la seña por MercadoPago, directo a tu cuenta. Si no paga, el turno se libera solo. ${TRIAL_DAYS} días de prueba sin tarjeta.`,
  path: '/para-complejos',
})

const HOLD_MINUTES = HOLD_TTL_SECONDS / 60
const WHATSAPP_URL = contactWhatsappUrl('Hola, quiero probar TurnoGol en mi complejo')

const primaryCta = cn(
  buttonVariants({ size: 'lg' }),
  'group h-12 gap-2 rounded-xl px-7 text-base font-semibold',
)
const secondaryCta = cn(
  buttonVariants({ variant: 'outline', size: 'lg' }),
  'h-12 gap-2 rounded-xl px-6 text-base font-semibold',
)

function Ctas() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link href="/register" className={primaryCta}>
        Probalo {TRIAL_DAYS} días
        <ArrowRight
          className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
          aria-hidden
        />
      </Link>
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={secondaryCta}>
        <MessageCircle className="h-[18px] w-[18px] text-emerald-400" aria-hidden />
        Escribinos por WhatsApp
      </a>
    </div>
  )
}

export default function ParaComplejosPage() {
  // `.dark-surface`: la página es siempre oscura (layout de (business)) y usa
  // los tokens semánticos y la BookingCard del panel; ver globals.css.
  return (
    <div className="dark-surface">
      <Hero />
      <Recorrido />
      <SiNoPaga />
      <ElResto />
      <Cierre />
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-12 pt-[120px] sm:px-6 sm:pb-16 sm:pt-[150px]">
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(48px,13vw,72px)] font-black italic leading-[0.94] tracking-[-0.035em] text-foreground lg:text-[clamp(64px,6.6vw,96px)]">
            <span className="block">Chau, reserva</span>{' '}
            <span className="hero-accent-text block">de palabra.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-pretty text-lg leading-[1.55] text-muted-foreground lg:text-xl">
            TurnoGol es el sistema de señas para canchas de fútbol. El jugador reserva desde la
            página de tu complejo y paga la seña por MercadoPago:{' '}
            <span className="font-semibold text-foreground">
              la plata entra directo a tu cuenta.
            </span>{' '}
            Vos elegís si la pedís y de cuánto.
          </p>
          <div className="mt-8">
            <Ctas />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sin tarjeta. Si no te sirve, lo dejás.
          </p>
        </div>
        <SenaPhone />
      </div>
    </section>
  )
}

function Step({
  n,
  title,
  children,
  fragment,
}: {
  n: number
  title: string
  children: ReactNode
  fragment: ReactNode
}) {
  return (
    <li className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <div className="flex gap-4 sm:gap-5">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-emerald-400 font-display text-lg font-bold tabular-nums text-emerald-300"
        >
          {n}
        </span>
        <div className="min-w-0 pt-1">
          <h3 className="font-display text-[26px] font-black italic leading-tight tracking-[-0.02em] text-foreground sm:text-[30px]">
            {title}
          </h3>
          <p className="mt-3 max-w-[30rem] text-pretty text-lg leading-[1.55] text-muted-foreground">
            {children}
          </p>
        </div>
      </div>
      <div className="min-w-0">{fragment}</div>
    </li>
  )
}

function Recorrido() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="recorrido-title"
      className="px-4 py-16 sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-[1240px]">
        <h2
          id="recorrido-title"
          className="max-w-[46rem] font-display text-[clamp(36px,8vw,56px)] font-black italic leading-[1] tracking-[-0.03em] text-foreground"
        >
          Así viaja una seña.
        </h2>
        <p className="mt-4 max-w-[36rem] text-pretty text-lg leading-[1.55] text-muted-foreground lg:text-xl">
          Del celular del que reserva a tu cuenta de MercadoPago, sin que atiendas el teléfono.
        </p>
        <ol className="mt-12 space-y-14 sm:mt-16 sm:space-y-20">
          <Step n={1} title="Elige el turno en tu página" fragment={<PageLinkFragment />}>
            Tu complejo tiene su propia página con las canchas, los precios y los horarios libres.
            La compartís por WhatsApp o la ponés en tu Instagram.
          </Step>
          <Step n={2} title={`Paga la seña en ${HOLD_MINUTES} minutos`} fragment={<HoldClock />}>
            Mientras paga, nadie más puede tomar ese turno. Si no paga a tiempo, se libera solo.
          </Step>
          <Step n={3} title="La plata entra a tu MercadoPago" fragment={<MoneyFragment />}>
            Conectás tu cuenta una vez y cada seña va directo ahí. TurnoGol no toca la plata.
          </Step>
          <Step n={4} title="Aparece en tu grilla" fragment={<GridFragment />}>
            Con la seña marcada y lo que falta cobrar en la cancha. Si reservan de noche, el aviso
            te llega a las 8.
          </Step>
        </ol>
      </div>
    </section>
  )
}

function SiNoPaga() {
  return (
    <section aria-labelledby="si-no-paga-title" className="px-4 pb-16 sm:px-6 sm:pb-20">
      <div className="mx-auto max-w-[1240px] border-t border-border pt-16 sm:pt-20">
        <h2
          id="si-no-paga-title"
          className="max-w-[46rem] font-display text-[clamp(36px,8vw,56px)] font-black italic leading-[1] tracking-[-0.03em] text-foreground"
        >
          ¿Y si no paga, o no viene?
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <h3 className="text-xl font-semibold text-foreground">No paga la seña</h3>
            <p className="mt-3 max-w-[30rem] text-pretty text-lg leading-[1.55] text-muted-foreground">
              A los {HOLD_MINUTES} minutos el turno se libera solo y queda libre para otro.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">Reserva y no viene</h3>
            <p className="mt-3 max-w-[30rem] text-pretty text-lg leading-[1.55] text-muted-foreground">
              {NO_SHOW_CONSEQUENCES[0]} {NO_SHOW_CONSEQUENCES[1]}
            </p>
          </div>
        </div>
        <p className="mt-12 max-w-[40rem] text-pretty text-lg leading-[1.55] text-muted-foreground">
          <span className="font-semibold text-foreground">¿No querés pedir seña?</span> Se reserva
          igual online y se paga en la cancha.
        </p>
      </div>
    </section>
  )
}

const RESTO = [
  {
    title: 'Turnos fijos',
    body: 'Se repiten solos cada semana y marcás quién pagó cada vez.',
  },
  {
    title: 'La caja de la noche',
    body: 'Reservas, cantina y lo que falta cobrar, en un solo cierre.',
  },
  {
    title: 'Tu encargado',
    body: 'Entra con su usuario a Hoy, la grilla, las reservas y la caja. Configuración y Métricas quedan para vos.',
  },
  {
    title: 'Métricas',
    body: 'Cómo te fue en el mes y qué cancha rinde más.',
  },
]

function ElResto() {
  return (
    <section id="features" aria-labelledby="resto-title" className="px-4 pb-16 sm:px-6 sm:pb-20">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-12 border-t border-border pt-16 sm:pt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <h2
          id="resto-title"
          className="font-display text-[clamp(36px,8vw,56px)] font-black italic leading-[1] tracking-[-0.03em] text-foreground"
        >
          Y el resto de la noche, en el mismo panel.
        </h2>
        <dl className="grid grid-cols-1 gap-x-10 gap-y-9 sm:grid-cols-2">
          {RESTO.map((r) => (
            <div key={r.title}>
              <dt className="text-xl font-semibold text-foreground">{r.title}</dt>
              <dd className="mt-2 text-pretty text-lg leading-[1.55] text-muted-foreground">
                {r.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Cierre() {
  return (
    <section aria-labelledby="cierre-title" className="px-4 pb-24 pt-8 sm:px-6 sm:pb-32">
      <div className="card-premium mx-auto max-w-[1240px] rounded-2xl px-6 py-12 sm:px-12 sm:py-16">
        <h2
          id="cierre-title"
          className="max-w-[40rem] font-display text-[clamp(36px,8vw,56px)] font-black italic leading-[1] tracking-[-0.03em] text-foreground"
        >
          Probalo {TRIAL_DAYS} días en tu complejo.
        </h2>
        <p className="mt-5 max-w-[38rem] text-pretty text-lg leading-[1.55] text-muted-foreground lg:text-xl">
          Sin tarjeta. Te ayudamos a configurarlo por WhatsApp: canchas, precios y horarios. Si no
          te sirve, lo dejás.
        </p>
        <div className="mt-8">
          <Ctas />
        </div>
        <Link
          href="/precios"
          className="mt-6 inline-flex items-center gap-1.5 text-base font-semibold text-emerald-400 underline-offset-4 hover:underline"
        >
          Ver precios <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
