import Image from 'next/image'
import { Sparkles } from 'lucide-react'
import { loginAction, resendConfirmationAction } from './actions'
import { LoginCard } from './LoginCard'
import { SiteHeaderShell } from '@/components/site/SiteHeaderShell'

const HERO_IMG =
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=2000&auto=format&fit=crop'

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <SiteHeaderShell />
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
        <span aria-hidden />

        <div className="max-w-md">
          <Sparkles className="mb-4 h-6 w-6 text-emerald-300" aria-hidden />
          <p className="text-2xl font-semibold leading-snug text-white">
            “Al principio no me acostumbraba a no tocar tanto el celu. A veces extraño contestar
            mensajes, imaginate. Ahora siento que me sobra el tiempo.”
          </p>
          {/* Testimonio real y autorizado sin nombre: docs/gtm/ejecucion/11-testimonios.md */}
          <p className="mt-4 text-sm text-slate-300">Dueño de un complejo de fútbol</p>
        </div>
      </div>
    </div>
  )
}

function FormPane() {
  return (
    <div className="relative flex items-center justify-center bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 pb-12 pt-28 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <LoginCard loginAction={loginAction} resendAction={resendConfirmationAction} />
      </div>
    </div>
  )
}
