'use client'

import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { forgotPasswordAction, type ForgotState } from './actions'
import { Logo } from '@/components/ui/logo'

const initial: ForgotState = { status: 'idle' }

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(forgotPasswordAction, initial)

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12 sm:px-6 lg:px-8">
      <Link
        href="/login"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver al login
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo variant="vertical" className="w-32" />
        </div>

        {state.status === 'sent' ? (
          <SentState />
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/[0.04] dark:border-white/[0.08] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
            <header className="mb-6 space-y-1">
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                Recuperar contraseña
              </h1>
              <p className="text-sm text-muted-foreground">
                Ingresá tu email y te mandamos un enlace para fijar una nueva.
              </p>
            </header>

            <form action={formAction} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="vos@complejo.com"
                  aria-invalid={state.status === 'error' ? 'true' : undefined}
                  className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
                />
                {state.status === 'error' && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {state.message}
                  </p>
                )}
              </div>
              <SubmitButton />
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function SentState() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 dark:bg-white/[0.04] dark:border-white/[0.08] p-8 text-center shadow-xl shadow-slate-900/5 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Mail className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
        Revisá tu email
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Si existe una cuenta con ese email, te enviamos un enlace para cambiar la contraseña.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        ¿No llegó? Revisá spam o{' '}
        <Link href="/forgot-password" className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
          probá de nuevo
        </Link>
        .
      </p>
    </div>
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
          Enviando…
        </>
      ) : (
        'Enviar enlace'
      )}
    </button>
  )
}
