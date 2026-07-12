'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import type { LoginState, ResendState } from './actions'

const initial: LoginState = { status: 'idle' }
const resendInitial: ResendState = { status: 'idle' }

/** Firmas de las Server Actions que consume el form. */
export type LoginAction = (prevState: LoginState, formData: FormData) => Promise<LoginState>
export type ResendConfirmationAction = (
  prevState: ResendState,
  formData: FormData,
) => Promise<ResendState>

/**
 * Card cliente de /login (email + contraseña + reenvío de confirmación). Las
 * 2 Server Actions llegan por PROP: './actions' es `'use server'` y arrastra
 * request-context → `node:async_hooks`, que Vite externaliza en el browser y
 * rompe la story si se importa como valor.
 */
export function LoginCard({
  loginAction,
  resendAction,
}: {
  loginAction: LoginAction
  resendAction: ResendConfirmationAction
}) {
  const [state, formAction] = useFormState(loginAction, initial)
  const [show, setShow] = useState(false)
  const isError = state.status === 'error'

  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/[0.04] dark:border-white/[0.08] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <header className="mb-6 space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Iniciá sesión
        </h1>
        <p className="text-sm text-muted-foreground">
          Ingresá con tu email y contraseña.
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
            aria-invalid={isError ? 'true' : undefined}
            className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Contraseña
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline"
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
              className="h-11 w-full rounded-lg border border-border bg-card px-3.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        {isError && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}

        <SubmitButton />
      </form>

      {/* Fuera del <form> a propósito: un <form> anidado adentro del de login es HTML
          inválido y el parser lo colapsa, así que el submit del botón de reenvío
          terminaba disparando loginAction en vez de resendAction. */}
      {isError && state.unconfirmedEmail && (
        <div className="mt-1.5">
          <ResendConfirmation email={state.unconfirmedEmail} action={resendAction} />
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Sos nuevo?{' '}
        <Link href="/register" className="font-semibold text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline">
          Empezar gratis
        </Link>
      </p>
    </div>
  )
}

function ResendConfirmation({
  email,
  action,
}: {
  email: string
  action: ResendConfirmationAction
}) {
  const [state, formAction] = useFormState(action, resendInitial)
  if (state.status === 'sent') {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Te reenviamos el email de confirmación. Revisá tu bandeja.
      </p>
    )
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        className="text-xs font-medium text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline"
      >
        Reenviar email de confirmación
      </button>
      {state.status === 'error' && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Ingresando…
        </>
      ) : (
        'Ingresar'
      )}
    </button>
  )
}
