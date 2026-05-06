'use client'

import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'
import { loginAction, type LoginState } from './actions'

const initial: LoginState = { status: 'idle' }

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initial)

  if (state.status === 'sent') {
    return (
      <div className="space-y-4 text-center">
        <Mail className="mx-auto h-10 w-10 text-sky-700" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Revisá tu email
        </h1>
        <p className="text-sm text-slate-600">
          Te enviamos un enlace mágico a <strong>{state.email}</strong>. Hacé click para entrar.
        </p>
        <p className="text-xs text-slate-500">
          ¿No llegó? Revisá spam o{' '}
          <Link href="/login" className="font-medium text-sky-700 hover:underline">
            probá de nuevo
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Iniciá sesión
        </h1>
        <p className="text-sm text-slate-600">
          Te enviamos un enlace mágico a tu email. Sin contraseñas.
        </p>
      </header>
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
            aria-invalid={state.status === 'error' ? 'true' : undefined}
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:border-sky-700 aria-[invalid=true]:border-red-600"
          />
          {state.status === 'error' && (
            <p role="alert" className="text-xs text-red-600">
              {state.message}
            </p>
          )}
        </div>
        <SubmitButton />
      </form>
      <p className="text-center text-sm text-slate-600">
        ¿Sos nuevo?{' '}
        <Link href="/register" className="font-medium text-sky-700 hover:underline">
          Creá tu cuenta
        </Link>
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
      className="inline-flex h-10 w-full items-center justify-center rounded-md bg-sky-700 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-sky-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Enviando…
        </>
      ) : (
        'Enviar enlace mágico'
      )}
    </button>
  )
}
