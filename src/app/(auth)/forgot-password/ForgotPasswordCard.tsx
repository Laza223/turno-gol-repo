'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import type { ForgotState } from './actions'

const initial: ForgotState = { status: 'idle' }

/** Firma de la Server Action que consume el form. */
export type ForgotPasswordAction = (
  prevState: ForgotState,
  formData: FormData,
) => Promise<ForgotState>

/**
 * Card cliente de "Olvidé mi contraseña" (idle/error/sent). La action llega
 * por PROP, no por import: './actions' es `'use server'` y arrastra
 * drizzle/postgres + `node:async_hooks` (vía request-context), lo que rompe
 * cualquier bundle de browser (Storybook) si se importa como valor. El type
 * import de `ForgotState` sí es seguro: se borra en compilación.
 */
export function ForgotPasswordCard({ action }: { action: ForgotPasswordAction }) {
  const [state, formAction] = useActionState(action, initial)

  if (state.status === 'sent') return <SentState />

  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/4 dark:border-white/8 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
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
            defaultValue={state.status === 'error' ? state.email : undefined}
            aria-invalid={state.status === 'error' ? 'true' : undefined}
            className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-invalid:border-red-500"
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
  )
}

function SentState() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 dark:bg-white/4 dark:border-white/8 p-8 text-center shadow-xl shadow-slate-900/5 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Mail className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Revisá tu email</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Si existe una cuenta con ese email, te enviamos un enlace para cambiar la contraseña.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        ¿No llegó? Revisá spam o{' '}
        <Link
          href="/forgot-password"
          className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
        >
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
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <TgBallSpinner size="xs" className="mr-2" aria-hidden />
          Enviando…
        </>
      ) : (
        'Enviar enlace'
      )}
    </button>
  )
}
