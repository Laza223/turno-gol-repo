import Link from 'next/link'
import type { CSSProperties } from 'react'
import {
  ArrowRight,
  BarChart3,
  Check,
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
import { HeroBackdrop } from '@/components/world/HeroBackdrop'
import { contactWhatsappUrl } from '@/lib/contact'
import { cn } from '@/lib/utils'
import Reveal from '@/components/site/Reveal'
import { Escenas } from './Escenas'
import { AgendaFragment } from './fragments'
import './para-complejos.css'

export const metadata = buildMetadata({
  title: 'TurnoGol para complejos — La grilla, el cobro y la caja de tu cancha',
  titleAbsolute: true,
  description: `Turnos, fijos, cobro por equipo y caja con cantina, todo desde el celular. Y si querés, tus jugadores reservan online. Gratis, sin cargar ningún dato de pago.`,
  path: '/para-complejos',
})

const WHATSAPP_URL = contactWhatsappUrl('Hola, quiero usar TurnoGol en mi complejo')

function Ctas({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('bz-ctas', className)} style={style}>
      <Link href="/register" className={cn(buttonVariants({ variant: 'pill', size: 'pill' }))}>
        Empezá gratis
        <ArrowRight aria-hidden />
      </Link>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: 'pill-glass', size: 'pill' }))}
      >
        <MessageCircle className="text-portal-green" aria-hidden />
        Escribinos por WhatsApp
      </a>
    </div>
  )
}

export default function ParaComplejosPage() {
  return (
    <>
      <Hero />
      <TeSuena />
      <Noche />
      <Cierre />
    </>
  )
}

function Hero() {
  return (
    <div className="bz-stage pc-stage">
      <HeroBackdrop />
      <section className="bz-hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="bz-title">
          <span className="bz-title__line" style={{ '--l': 0 } as CSSProperties}>
            <span>Chau cuaderno,</span>
          </span>{' '}
          <span className="bz-title__line" style={{ '--l': 1 } as CSSProperties}>
            <em>chau WhatsApp.</em>
          </span>
        </h1>
        <p className="bz-lead bz-rise" style={{ '--i': 1 } as CSSProperties}>
          Turnos, cobros y caja de tu complejo, en el celular.
        </p>
        <Ctas className="bz-rise" style={{ '--i': 2 } as CSSProperties} />
        <p className="pc-fine bz-rise" style={{ '--i': 3 } as CSSProperties}>
          Gratis. No te pedimos ningún dato de pago.
        </p>
        {/* Se vende gratis (2026-11-16): la prueba del Completo no se anuncia. */}
        <p className="pc-fine bz-rise" style={{ '--i': 3 } as CSSProperties}>
          Y aparecés donde los jugadores de tu zona buscan cancha.{' '}
          <Link href="/precios">Ver los planes</Link>
        </p>
      </section>
    </div>
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
    <section aria-labelledby="suena-title" className="bz-sec bz-sec--glow bz-sec--full">
      <div className="bz-wrap">
        <Reveal className="bz-head">
          <h2 id="suena-title" className="bz-h2">
            ¿Te suena?
          </h2>
        </Reveal>
        <Escenas />
      </div>
    </section>
  )
}

function Noche() {
  return (
    <section
      id="features"
      aria-labelledby="noche-title"
      className="bz-sec bz-sec--glow bz-sec--glow-l bz-sec--full"
    >
      <div className="bz-wrap">
        <Reveal className="bz-head">
          <h2 id="noche-title" className="bz-h2">
            Así se ve la noche de tu complejo.
          </h2>
          <p className="bz-lead2">En la PC del mostrador o en tu celular. Sin instalar nada.</p>
        </Reveal>
        <Reveal>
          <AgendaFragment />
        </Reveal>
        <ul className="bz-feats">
          {CHIPS.map(({ label }) => (
            <li key={label} className="bz-feat">
              <Check aria-hidden />
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
    <section aria-labelledby="cierre-title" className="bz-sec">
      <div className="bz-wrap">
        <Reveal className="bz-cta glass-painted">
          <div>
            <h2 id="cierre-title" className="bz-h2">
              Empezá gratis en tu complejo.
            </h2>
            <p className="bz-lead2">
              No te pedimos ningún dato de pago. Mandanos una foto de tu cuaderno y te lo dejamos
              cargado.
            </p>
            <Ctas className="justify-start" style={{ marginTop: 24 }} />
          </div>
          <Link
            href="/precios"
            className={cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }))}
          >
            Ver precios
            <ArrowRight aria-hidden />
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
