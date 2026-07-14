import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { registerAction } from './actions'
import { RegisterCard } from './RegisterCard'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=2000&auto=format&fit=crop'

export default function RegisterPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <ImagePane />
      <FormPane />
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
        <Link href="/">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 shadow-lg shadow-emerald-500/30" />
        </Link>

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

function FormPane() {
  return (
    <div className="relative flex items-center justify-center bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors lg:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center lg:hidden">
          <Logo variant="vertical" className="w-32" />
        </div>

        <RegisterCard action={registerAction} />
      </div>
    </div>
  )
}
