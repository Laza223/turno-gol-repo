import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { loginAction, resendConfirmationAction } from './actions'
import { LoginCard } from './LoginCard'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=2000&auto=format&fit=crop'

export default function LoginPage() {
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
        alt="Cancha de fútbol iluminada"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-br from-slate-950/85 via-slate-950/60 to-emerald-900/45"
      />
      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <Link href="/">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 shadow-lg shadow-emerald-500/30" />
        </Link>

        <div className="max-w-md">
          <Sparkles className="mb-4 h-6 w-6 text-emerald-300" aria-hidden />
          <p className="text-2xl font-semibold leading-snug text-white">
            “En tres meses subimos la facturación 40% sin contratar a nadie.”
          </p>
          <p className="mt-4 text-sm text-slate-300">
            Marcelo Pérez · Complejo San Martín, Mendoza
          </p>
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

        <LoginCard loginAction={loginAction} resendAction={resendConfirmationAction} />
      </div>
    </div>
  )
}
