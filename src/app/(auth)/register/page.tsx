'use client'

import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'
import { registerAction, type RegisterState } from './actions'

const initial: RegisterState = { status: 'idle' }

export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, initial)

  if (state.status === 'sent') {
    return (
      <div className="space-y-4 text-center">
        <Mail className="mx-auto h-10 w-10 text-sky-700" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Revisá tu email
        </h1>
        <p className="text-sm text-slate-600">
          Te enviamos un enlace a <strong>{state.email}</strong>. Hacé click para activar tu cuenta.
        </p>
      </div>
    )
  }

  const errs = state.status === 'error' ? state.fieldErrors : {}

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Creá tu cuenta
        </h1>
        <p className="text-sm text-slate-600">
          En menos de un minuto. Sin contraseñas.
        </p>
      </header>
      <form action={formAction} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="firstName"
            name="firstName"
            label="Nombre"
            autoComplete="given-name"
            error={errs.firstName}
          />
          <Field
            id="lastName"
            name="lastName"
            label="Apellido"
            autoComplete="family-name"
            error={errs.lastName}
          />
        </div>
        <Field
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="vos@complejo.com"
          error={errs.email}
        />
        <Field
          id="phone"
          name="phone"
          label="Celular"
          type="tel"
          autoComplete="tel"
          placeholder="+54 9 11 1234-5678"
          helper="Formato argentino con prefijo +54 9"
          error={errs.phone}
        />
        {errs._form && (
          <p role="alert" className="text-xs text-red-600">
            {errs._form}
          </p>
        )}
        <SubmitButton />
      </form>
      <p className="text-center text-sm text-slate-600">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-medium text-sky-700 hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  )
}

function Field(props: {
  id: string
  name: string
  label: string
  type?: string
  autoComplete?: string
  placeholder?: string
  helper?: string
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={props.id} className="text-sm font-medium text-slate-900">
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.name}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        required
        aria-invalid={props.error ? 'true' : undefined}
        className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:border-sky-700 aria-[invalid=true]:border-red-600"
      />
      {props.error ? (
        <p role="alert" className="text-xs text-red-600">
          {props.error}
        </p>
      ) : props.helper ? (
        <p className="text-xs text-slate-500">{props.helper}</p>
      ) : null}
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
          Creando…
        </>
      ) : (
        'Crear cuenta'
      )}
    </button>
  )
}
