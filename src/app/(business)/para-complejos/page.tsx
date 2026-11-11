import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Globe,
  Lock,
  MessageCircle,
  Repeat,
  ShieldAlert,
  Store,
  UserCog,
} from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { buttonVariants } from '@/components/ui/button'
import { contactWhatsappUrl } from '@/lib/contact'
import { TRIAL_DAYS } from '@/shared/constants'
import { cn } from '@/lib/utils'
import Reveal from '@/components/site/Reveal'
import { Escenas } from './Escenas'
import { GridFragment, NochePhone } from './fragments'

export const metadata = buildMetadata({
  title: 'TurnoGol para complejos — La grilla, el cobro y la caja de tu cancha',
  titleAbsolute: true,
  description: `Turnos, fijos, cobro por equipo y caja con cantina, todo desde el celular. Y si querés, tus jugadores reservan online. ${TRIAL_DAYS} días gratis, sin tarjeta.`,
  path: '/para-complejos',
})

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
  return (
    <div className="dark-surface">
      <Hero />
      <TeSuena />
      <Noche />
      <Cierre />
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-10 pt-[96px] sm:px-6 sm:pb-16 sm:pt-[150px]">
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-8 sm:gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(48px,13vw,72px)] font-black italic leading-[0.94] tracking-[-0.035em] text-foreground lg:text-[clamp(56px,5.6vw,84px)]">
            <span className="block">Chau cuaderno,</span>{' '}
            <span className="hero-accent-text block">chau WhatsApp.</span>
          </h1>
          <p className="mt-4 max-w-[34rem] text-pretty text-lg leading-[1.55] text-muted-foreground sm:mt-6 lg:text-xl">
            Turnos, cobros y caja de tu complejo, en el celular.
          </p>
          <div className="mt-6 sm:mt-8">
            <Ctas />
          </div>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4">
            Sin tarjeta. Te ayudamos a dejarlo andando.
          </p>
          {/* Freemium (2026-11-08): el gratis va de puerta de entrada, nunca de
              titular sobre la noche. */}
          <p className="mt-4 text-sm text-muted-foreground">
            Aparecé gratis donde los jugadores de tu zona buscan cancha.{' '}
            <Link href="/precios" className="font-semibold text-foreground underline">
              Ver los planes
            </Link>
          </p>
        </div>
        <NochePhone />
      </div>
    </section>
  )
}

const CHIPS = [
  { icon: Repeat, label: 'Turnos fijos' },
  { icon: Store, label: 'Cantina con stock' },
  { icon: Lock, label: 'Cierre de caja' },
  { icon: UserCog, label: 'Usuario para tu encargado' },
  { icon: BarChart3, label: 'Métricas del mes' },
  { icon: ShieldAlert, label: 'Freno al que reserva y no viene' },
  { icon: Globe, label: 'Seña online, si querés' },
]

function TeSuena() {
  return (
    <section aria-labelledby="suena-title" className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[1040px]">
        <h2
          id="suena-title"
          className="font-display text-[clamp(36px,8vw,56px)] font-black italic leading-[1] tracking-[-0.03em] text-foreground"
        >
          ¿Te suena?
        </h2>
        <Escenas />
      </div>
    </section>
  )
}

function Noche() {
  return (
    <section id="features" aria-labelledby="noche-title" className="px-4 pb-16 sm:px-6 sm:pb-20">
      <div className="mx-auto max-w-[1040px] border-t border-border pt-16 sm:pt-20">
        <h2
          id="noche-title"
          className="font-display text-[clamp(36px,8vw,56px)] font-black italic leading-[1] tracking-[-0.03em] text-foreground"
        >
          Así se ve tu noche.
        </h2>
        <Reveal className="mt-10">
          <GridFragment />
        </Reveal>
        <p className="mt-6 text-pretty text-lg leading-[1.55] text-muted-foreground lg:text-xl">
          En la PC del mostrador o en tu celular. Sin instalar nada.
        </p>
        <ul className="mt-8 flex flex-wrap gap-3">
          {CHIPS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-base font-medium text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
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
          Sin tarjeta. Te ayudamos a configurarlo por WhatsApp.
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
