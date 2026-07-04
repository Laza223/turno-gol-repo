'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react'
import { playerLoginAction, type PlayerLoginState } from './actions'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=2000&auto=format&fit=crop'

const initial: PlayerLoginState = { status: 'idle' }

/** Glass dark premium (espeja LoginGate / retorno de reserva). */
const cardStyle = {
  background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
  border: '1px solid rgba(255,255,255,.1)',
  boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
} as const

const inputClass =
  'h-11 w-full rounded-lg border border-white/10 bg-white/[.04] px-3.5 text-sm text-white placeholder:text-slate-500 transition-colors focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 aria-[invalid=true]:border-red-500'

function DeletedNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get('deleted') !== '1') return null
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/10">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
      </div>
      <div>
        <p className="font-semibold text-emerald-200">Tu cuenta fue eliminada</p>
        <p className="mt-0.5 text-xs text-emerald-300/80">
          Lamentamos verte partir. Podés volver cuando quieras.
        </p>
      </div>
    </div>
  )
}

export default function IngresarPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2" style={{ background: '#020617' }}>
      <ImagePane />
      <FormPane />
    </div>
  )
}

function ImagePane() {
  return (
    <div className="relative isolate hidden overflow-hidden lg:block">
      <Image
        src={HERO_IMG}
        alt="Jugadores en una cancha de fútbol"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-[#020617]/95 via-[#020617]/70 to-emerald-900/40"
      />
      {/* Glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-12%] left-[-8%] h-[460px] w-[460px] rounded-full blur-[12px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.28), transparent 70%)' }}
      />
      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <Link href="/">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 shadow-lg shadow-emerald-500/30" />
        </Link>
        <div className="max-w-md">
          <div className="inline-flex items-center gap-2.5 font-logo text-[12px] font-bold uppercase tracking-[.1em] text-emerald-400">
            <span className="relative flex h-[9px] w-[9px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
            </span>
            Tu cuenta TurnoGol
          </div>
          <h2
            className="mt-4 font-display font-black italic text-white"
            style={{ fontSize: 'clamp(32px, 3vw, 44px)', lineHeight: '1', letterSpacing: '-0.03em' }}
          >
            Tu próxima cancha
            <br />
            <span
              style={{
                background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              te está esperando.
            </span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            Accedé con tu email y gestioná todas tus reservas. Ingreso seguro, sin contraseña.
          </p>
        </div>
      </div>
    </div>
  )
}

function FormPane() {
  return (
    <div className="relative isolate flex items-center justify-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      {/* Glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-15%] top-[-10%] -z-10 h-[440px] w-[440px] rounded-full blur-[12px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.16), transparent 72%)' }}
      />
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center lg:hidden">
          <Logo variant="vertical" className="w-32" textClassName="text-white" />
        </div>
        <Suspense fallback={null}>
          <DeletedNotice />
          <FormCard />
        </Suspense>
        <p className="mt-6 text-center text-sm text-slate-400">
          ¿Primera vez en TurnoGol?{' '}
          <Link href="/explorar" className="font-semibold text-emerald-300 transition-colors hover:text-emerald-200">
            Descubrí complejos y reservá tu cancha
          </Link>
        </p>
      </div>
    </div>
  )
}

function FormCard() {
  const [state, formAction] = useFormState(playerLoginAction, initial)
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/mis-reservas'

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl p-8 text-center" style={cardStyle}>
        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
          <span aria-hidden className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/30 motion-reduce:hidden" />
          <span
            className="relative flex h-16 w-16 items-center justify-center rounded-full text-emerald-300"
            style={{
              background: 'radial-gradient(closest-side, rgba(16,185,129,.28), rgba(2,6,23,.4))',
              border: '1px solid rgba(16,185,129,.4)',
              boxShadow: '0 0 50px rgba(16,185,129,.45)',
            }}
          >
            <Mail className="h-6 w-6" aria-hidden />
          </span>
        </div>
        <h1 className="font-display text-2xl font-black italic tracking-tight text-white">Revisá tu email</h1>
        <p className="mt-3 text-sm text-slate-400">
          Te enviamos un enlace de acceso a <strong className="text-slate-200">{state.email}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-8" style={cardStyle}>
      <header className="mb-6 space-y-1">
        <h1 className="font-display text-3xl font-black italic tracking-tight text-white">
          Accedé a tu{' '}
          <span
            style={{
              background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            cuenta
          </span>
        </h1>
        <p className="text-sm text-slate-400">Te enviamos un enlace seguro de acceso a tu email. Sin contraseñas que recordar.</p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vos@email.com"
            aria-invalid={state.status === 'error' ? 'true' : undefined}
            className={inputClass}
          />
        </div>
        {state.status === 'error' && (
          <p role="alert" className="text-xs text-red-300">
            {state.message}
          </p>
        )}
        <SubmitButton />
      </form>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617] disabled:translate-y-0 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Enviando…
        </>
      ) : (
        'Enviarme el enlace'
      )}
    </button>
  )
}
