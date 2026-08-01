'use client'

import { useFormStatus } from 'react-dom'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
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
  const [state, formAction] = useActionState(loginAction, initial)
  const [show, setShow] = useState(false)
  const isError = state.status === 'error'

  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/4 dark:border-white/8 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
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
            defaultValue={state.status === 'error' ? state.email : undefined}
            aria-invalid={isError ? 'true' : undefined}
            className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-invalid:border-red-500"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Contraseña
            </label>
            <Link
              href="/forgot-password"
              // inline-flex + min-h-11: es un control de la fila del campo, no un
              // link dentro de texto corrido, así que no le aplica la excepción
              // "inline" de WCAG 2.5.5. Medía 149x16.
              className="inline-flex min-h-11 items-center text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline md:min-h-0"
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
              className="h-11 w-full rounded-lg border border-border bg-card px-3.5 pr-11 text-base md:text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-invalid:border-red-500"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              // El área tocable era la del ícono: 16x16. Se le da la caja de 44
              // que exige WCAG 2.5.5 sin mover el ícono (el input ya reserva
              // pr-11 = 44px, así que el cuadrado encaja justo).
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
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
  const [state, formAction] = useActionState(action, resendInitial)
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
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <TgBallSpinner size="xs" className="mr-2" aria-hidden />
          Ingresando…
        </>
      ) : (
        'Ingresar'
      )}
    </button>
  )
}
