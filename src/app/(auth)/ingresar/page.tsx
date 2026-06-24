'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { playerLoginAction, type PlayerLoginState } from './actions'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=2000&auto=format&fit=crop'

const initial: PlayerLoginState = { status: 'idle' }

function DeletedNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get('deleted') !== '1') return null
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm shadow-emerald-100">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-emerald-50">
        <span className="text-xs font-bold text-emerald-700">✓</span>
      </div>
      <div>
        <p className="font-semibold text-emerald-900">Tu cuenta fue eliminada</p>
        <p className="mt-0.5 text-xs text-emerald-700">
          Lamentamos verte partir. Podés volver cuando quieras.
        </p>
      </div>
    </div>
  )
}

export default function IngresarPage() {
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
        alt="Jugadores en una cancha de fútbol"
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
          <h2 className="text-3xl font-extrabold tracking-tight text-white">
            Tu próxima cancha,
            <br />a un toque.
          </h2>
          <p className="mt-4 text-sm text-slate-300">
            Entrá con tu email y seguí tus reservas. Sin contraseñas.
          </p>
        </div>
      </div>
    </div>
  )
}

function FormPane() {
  return (
    <div className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900 lg:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center lg:hidden">
          <Logo variant="vertical" className="w-32" />
        </div>
        <Suspense fallback={null}>
          <DeletedNotice />
        </Suspense>
        <FormCard />
        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Primera vez?{' '}
          <Link href="/explorar" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
            Reservá tu cancha en Explorar
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
      <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
          <Mail className="h-6 w-6 text-emerald-700" aria-hidden />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Revisá tu email</h1>
        <p className="mt-3 text-sm text-slate-600">
          Te enviamos un enlace de acceso a <strong className="text-slate-900">{state.email}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <header className="mb-6 space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Ingresá a tu cuenta</h1>
        <p className="text-sm text-slate-600">Sin contraseñas: te mandamos un enlace de acceso por email.</p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
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
            placeholder="vos@email.com"
            aria-invalid={state.status === 'error' ? 'true' : undefined}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 aria-[invalid=true]:border-red-500"
          />
        </div>
        {state.status === 'error' && (
          <p role="alert" className="text-xs text-red-600">
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
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:opacity-60"
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
