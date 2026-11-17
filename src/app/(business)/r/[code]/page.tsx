import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { resolveReferralCode } from '@/modules/referrals/referral.service'
import { contactWhatsappUrl } from '@/lib/contact'
import { PersistReferralCode } from './PersistReferralCode'

// Landing de referidos (B1): nunca indexable — el `name` que muestra es el de
// UN complejo puntual, sin valor SEO propio, y el mismo patrón de
// `(public)/suspended/page.tsx`.
export const metadata: Metadata = {
  title: 'Te recomendaron TurnoGol',
  robots: { index: false, follow: false },
}

/**
 * Los tres únicos puntos permitidos (decisión del dueño, B1): verdad
 * verificable del producto, sin números de clientes ni testimonios.
 */
const BENEFITS = [
  'En el mostrador se anota cada turno y cada venta de la cantina.',
  'Ves qué se cobró y qué no, aunque no estés.',
  'Te lo dejamos andando con tus canchas y tus precios.',
]

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const referral = await resolveReferralCode(code)
  // Código inválido o inexistente: no hay nada que mostrar, mandamos a la
  // landing comercial de siempre en vez de un 404 seco.
  if (!referral) redirect('/para-complejos')

  // El WhatsApp COMERCIAL de TurnoGol sale de su fuente única (`contact.ts`),
  // no del parser de teléfonos de complejos (`whatsapp.ts`).
  const whatsappUrl = contactWhatsappUrl(`Hola, vengo de parte de ${referral.name}`)

  return (
    <section className="bz-hero bz-hero--short">
      <PersistReferralCode code={code} />
      <p className="bz-eyebrow">{referral.name} te recomienda</p>
      <h1 className="bz-title">
        <span className="bz-title__line" style={{ '--l': 0 } as CSSProperties}>
          <span>TurnoGol</span>
        </span>
      </h1>

      <ul
        className="bz-ticks bz-rise mt-8 w-full max-w-[480px] text-left"
        style={{ '--i': 1 } as CSSProperties}
      >
        {BENEFITS.map((benefit) => (
          <li key={benefit}>
            <Check aria-hidden />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <p
        className="bz-fine bz-rise font-semibold text-portal-slot-ink"
        style={{ '--i': 2 } as CSSProperties}
      >
        Gratis. No te pedimos ningún dato de pago.
      </p>

      <div className="bz-ctas bz-rise" style={{ '--i': 3 } as CSSProperties}>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'pill', size: 'pill' }))}
        >
          Hablar por WhatsApp
          <ArrowRight className="size-4.5" aria-hidden />
        </a>
        <Link
          href={`/register?ref=${code}`}
          className={cn(buttonVariants({ variant: 'pill-glass', size: 'pill' }))}
        >
          Crear mi cuenta
        </Link>
      </div>
    </section>
  )
}
