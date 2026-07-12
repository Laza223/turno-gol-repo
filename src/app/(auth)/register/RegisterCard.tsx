'use client'

import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'
import type { RegisterState } from './actions'
import { PhoneInput } from '@/components/ui/phone-input'

const initial: RegisterState = { status: 'idle' }

/** Firma de la Server Action que consume el form. */
export type RegisterAction = (
  prevState: RegisterState,
  formData: FormData,
) => Promise<RegisterState>

/**
 * Card cliente de /register (form + confirm/existing). La action llega por
 * PROP: './actions' es `'use server'` y arrastra request-context →
 * `node:async_hooks`, que Vite externaliza en el browser y rompe la story si
 * se importa como valor.
 */
export function RegisterCard({ action }: { action: RegisterAction }) {
  const [state, formAction] = useFormState(action, initial)

  if (state.status === 'confirm') return <ConfirmState email={state.email} />
  if (state.status === 'existing') return <ExistingState email={state.email} />
  return <FormCard state={state} formAction={formAction} />
}

function FormCard({
  state,
  formAction,
}: {
  state: RegisterState
  formAction: (formData: FormData) => void
}) {
  const errs = state.status === 'error' ? state.fieldErrors : {}

  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/[0.04] dark:border-white/[0.08] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <header className="mb-6 space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Creá tu cuenta
        </h1>
        <p className="text-sm text-muted-foreground">
          Registrá tu complejo y empezá a recibir reservas online.
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
        <PhoneInput
          id="phone"
          name="phone"
          label="Celular"
          placeholder="11 1234-5678"
          error={errs.phone}
        />
        <Field
          id="password"
          name="password"
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          error={errs.password}
        />
        <Field
          id="confirmPassword"
          name="confirmPassword"
          label="Repetir contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Repetí la contraseña"
          error={errs.confirmPassword}
        />
        {errs._form && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {errs._form}
          </p>
        )}
        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-semibold text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline">
          Ingresar
        </Link>
      </p>
    </div>
  )
}

function ConfirmState({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 dark:bg-white/[0.04] dark:border-white/[0.08] p-8 text-center shadow-xl shadow-slate-900/5 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Mail className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
        Confirmá tu email
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Te enviamos un email a <strong className="text-foreground">{email}</strong>.
        Hacé click en el enlace para activar tu cuenta; después entrás con tu contraseña.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        ¿No llegó? Revisá spam. Podés volver a{' '}
        <Link href="/register" className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
          registrarte
        </Link>
        .
      </p>
    </div>
  )
}

function ExistingState({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 dark:bg-white/[0.04] dark:border-white/[0.08] p-8 text-center shadow-xl shadow-slate-900/5 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
        Ya tenés una cuenta
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Ya existe una cuenta con <strong className="text-foreground">{email}</strong>.
        ¿Querés agregar otro complejo? Iniciá sesión y sumalo desde tu panel.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        Ingresar
      </Link>
    </div>
  )
}

function Field(props: {
  id: string
  name: string
  label: string
  type?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'search' | 'url' | 'none'
  autoComplete?: string
  placeholder?: string
  helper?: string
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={props.id} className="text-sm font-medium text-foreground">
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.name}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        required
        aria-invalid={props.error ? 'true' : undefined}
        className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
      />
      {props.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {props.error}
        </p>
      ) : props.helper ? (
        <p className="text-xs text-muted-foreground">{props.helper}</p>
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
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
