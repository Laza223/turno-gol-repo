'use client'

import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react'
import { registerAction, type RegisterState } from './actions'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=2000&auto=format&fit=crop'

const initial: RegisterState = { status: 'idle' }

export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, initial)

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
        alt="Cancha de fútbol al atardecer"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/65 to-emerald-900/45"
      />
      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <Link href="/">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 shadow-lg shadow-emerald-500/30" />
        </Link>

        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white">
            Empezá hoy.
            <br />
            Cobrá tu primera seña esta semana.
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-slate-200">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              30 días gratis, sin tarjeta
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              MercadoPago integrado
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              Setup en menos de 2 minutos
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function FormPane({
  state,
  formAction,
}: {
  state: RegisterState
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

        {state.status === 'sent' ? (
          <SentState email={state.email} />
        ) : state.status === 'existing' ? (
          <ExistingState email={state.email} />
        ) : (
          <FormCard state={state} formAction={formAction} />
        )}
      </div>
    </div>
  )
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
    <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <header className="mb-6 space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
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
          inputMode="tel"
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

      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  )
}

function SentState({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Mail className="h-6 w-6 text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
        Revisá tu email
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Te enviamos un enlace a <strong className="text-slate-900">{email}</strong>. Hacé click para activar tu cuenta.
      </p>
    </div>
  )
}

function ExistingState({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
        Ya tenés una cuenta
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Ya existe una cuenta con <strong className="text-slate-900">{email}</strong>.
        ¿Querés agregar otro complejo? Iniciá sesión y sumalo desde tu panel.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        Iniciar sesión
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
      <label htmlFor={props.id} className="text-sm font-medium text-slate-900">
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
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
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
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
