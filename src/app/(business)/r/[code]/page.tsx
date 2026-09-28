import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
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
    <section className="relative flex min-h-[70vh] items-center overflow-hidden px-4 py-24 sm:px-6">
      <PersistReferralCode code={code} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(16,185,129,.18), transparent 60%)',
        }}
      />
      <div className="relative z-10 mx-auto max-w-[640px] text-center">
        <p className="font-logo text-xs font-bold uppercase tracking-[.12em] text-emerald-400">
          {referral.name} te recomienda
        </p>
        <h1
          className="mt-3 font-display font-black italic text-[#f8fafc]"
          style={{
            fontSize: 'clamp(32px, 5vw, 52px)',
            lineHeight: '1.05',
            letterSpacing: '-0.03em',
          }}
        >
          TurnoGol
        </h1>

        <ul className="mt-8 space-y-3 text-left">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3 text-slate-300">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm font-semibold text-emerald-400">30 días gratis, sin tarjeta.</p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-emerald-400 hover:shadow-[0_0_32px_rgba(16,185,129,0.5)] active:scale-[0.98] sm:px-8"
          >
            Hablar por WhatsApp
            <ArrowRight
              className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
              aria-hidden
            />
          </a>
          <Link
            href={`/register?ref=${code}`}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 px-7 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/10 hover:border-white/25"
          >
            Crear mi cuenta
          </Link>
        </div>
      </div>
    </section>
  )
}
