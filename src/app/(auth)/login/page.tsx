'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, Sparkles } from 'lucide-react'
import {
  loginAction,
  playerLoginAction,
  resendConfirmationAction,
  type LoginState,
  type PlayerLoginState,
  type ResendState,
} from './actions'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=2000&auto=format&fit=crop'

const initial: LoginState = { status: 'idle' }
const playerInitial: PlayerLoginState = { status: 'idle' }
const resendInitial: ResendState = { status: 'idle' }

function DeletedNotice() {
  const searchParams = useSearchParams()
  const deleted = searchParams.get('deleted')

  if (deleted !== '1') return null

  return (
    <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm shadow-emerald-100 flex items-start gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-emerald-50">
        <span className="text-xs font-bold text-emerald-700">✓</span>
      </div>
      <div>
        <p className="font-semibold text-emerald-900">Tu cuenta fue eliminada</p>
        <p className="text-xs text-emerald-700 mt-0.5">Lamentamos verte partir. Podés volver a registrarte cuando quieras.</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initial)

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <ImagePane />
      <FormPane state={state} formAction={formAction} />
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
        className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/60 to-emerald-900/45"
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

function FormPane({
  state,
  formAction,
}: {
  state: LoginState
  formAction: (formData: FormData) => void
}) {
  return (
    <div className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900 transition-colors lg:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center lg:hidden">
          <Logo variant="vertical" className="w-32" />
        </div>

        <FormCard state={state} formAction={formAction} />
        <Suspense fallback={null}>
          <PlayerAccess />
        </Suspense>
      </div>
    </div>
  )
}

function FormCard({
  state,
  formAction,
}: {
  state: LoginState
  formAction: (formData: FormData) => void
}) {
  const [show, setShow] = useState(false)
  const isError = state.status === 'error'

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <header className="mb-6 space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Iniciá sesión
        </h1>
        <p className="text-sm text-slate-600">
          Ingresá con tu email y contraseña.
        </p>
      </header>

      <Suspense fallback={null}>
        <DeletedNotice />
      </Suspense>

      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-900">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vos@complejo.com"
            aria-invalid={isError ? 'true' : undefined}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-900">
              Contraseña
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              aria-invalid={isError ? 'true' : undefined}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        {isError && (
          <div className="space-y-1.5">
            <p role="alert" className="text-xs text-red-600">
              {state.message}
            </p>
            {state.unconfirmedEmail && <ResendConfirmation email={state.unconfirmedEmail} />}
          </div>
        )}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Sos nuevo?{' '}
        <Link href="/register" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
          Creá tu cuenta
        </Link>
      </p>
    </div>
  )
}

function ResendConfirmation({ email }: { email: string }) {
  const [state, formAction] = useFormState(resendConfirmationAction, resendInitial)
  if (state.status === 'sent') {
    return (
      <p className="text-xs text-emerald-700">
        Te reenviamos el email de confirmación. Revisá tu bandeja.
      </p>
    )
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
      >
        Reenviar email de confirmación
      </button>
      {state.status === 'error' && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.message}
        </p>
      )}
    </form>
  )
}

function PlayerAccess() {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useFormState(playerLoginAction, playerInitial)
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/mis-reservas'

  return (
    <div className="mt-4 rounded-2xl border border-slate-200/60 bg-white/70 p-4 text-center shadow-sm backdrop-blur-md">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          ¿Sos jugador? Ingresá con tu email
        </button>
      ) : state.status === 'sent' ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <Mail className="h-5 w-5 text-emerald-700" aria-hidden />
          <p className="text-sm text-slate-700">
            Te enviamos un enlace de acceso a <strong>{state.email}</strong>.
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-3 text-left" noValidate>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="player-email" className="text-sm font-medium text-slate-900">
            Email de jugador
          </label>
          <input
            id="player-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vos@email.com"
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
          />
          {state.status === 'error' && (
            <p role="alert" className="text-xs text-red-600">
              {state.message}
            </p>
          )}
          <PlayerSubmitButton />
        </form>
      )}
    </div>
  )
}

function PlayerSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-emerald-600 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Enviando…
        </>
      ) : (
        'Enviarme un enlace de acceso'
      )}
    </button>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Ingresando…
        </>
      ) : (
        'Iniciar sesión'
      )}
    </button>
  )
}
