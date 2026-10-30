import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'
import { registerAction } from './actions'
import { RegisterCard } from './RegisterCard'
import { SiteHeaderShell } from '@/components/site/SiteHeaderShell'
import { referralCodeSchema } from '@/modules/referrals/referral.schema'

const HERO_IMG =
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=2000&auto=format&fit=crop'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ pending?: string; ref?: string }>
}) {
  const sp = await searchParams
  // F-025: marca de "ya te registraste, revisá el mail" que sobrevive un F5.
  // Solo el flag viaja por la URL — el email queda en sessionStorage (dato
  // personal, ver el comentario en RegisterCard).
  const pending = sp?.pending === '1'

  // Programa de referidos (B2): `?ref=` de la landing `/r/<CODE>` o de un link
  // compartido directo. Formato inválido se descarta en silencio acá —
  // RegisterCard igual cae al código guardado en localStorage, si hay.
  const refParsed = typeof sp?.ref === 'string' ? referralCodeSchema.safeParse(sp.ref) : null
  const refCode = refParsed?.success ? refParsed.data : null

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <SiteHeaderShell />
      <ImagePane />
      <FormPane pending={pending} refCode={refCode} />
    </div>
  )
}

function ImagePane() {
  return (
    <div className="relative hidden lg:block">
      <Image
        src={HERO_IMG}
        alt="Cancha de fútbol al atardecer"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-br from-slate-950/85 via-slate-950/65 to-emerald-900/45"
      />
      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <span aria-hidden />

        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white">
            Empezá hoy.
            <br />
            Tu primera reserva online puede llegar esta semana.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-slate-200">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              30 días de prueba sin costo
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              Cobros automáticos con MercadoPago
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              Configuración en menos de 2 minutos
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function FormPane({ pending, refCode }: { pending: boolean; refCode: string | null }) {
  return (
    <div className="relative flex items-center justify-center bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 pb-12 pt-28 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <RegisterCard action={registerAction} pending={pending} refCode={refCode} />
      </div>
    </div>
  )
}
