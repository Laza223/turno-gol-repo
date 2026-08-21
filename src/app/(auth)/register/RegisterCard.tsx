'use client'

import { useActionState, useEffect, useSyncExternalStore } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { CheckCircle2, Mail } from 'lucide-react'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
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
/**
 * F-025 (QA de producción 2026-08-17): el estado "esperando confirmación" vivía
 * solo en `useActionState`, o sea en memoria del navegador. Un F5 en esa pestaña
 * lo reiniciaba a `idle` y reaparecía el formulario VACÍO, como si el registro
 * nunca hubiera pasado — el dueño que refresca por ansiedad puede volver a
 * registrarse creyendo que falló.
 *
 * El flag sobrevive en la URL (`?pending=1`, que el Server Component lee y pasa
 * como prop) y el email en `sessionStorage`. La separación es deliberada: el
 * email es dato personal y no va en un query string — se filtra a logs,
 * referrers y al historial del navegador. Si el `sessionStorage` no lo tiene
 * (otra pestaña, storage limpiado), se muestra el mismo cartel sin el email:
 * peor mensaje, nunca el formulario vacío.
 */
const PENDING_EMAIL_KEY = 'tg_register_pending_email'

/** El valor no cambia durante la vida de la página: no hay a qué suscribirse. */
const subscribeNever = () => () => {}

function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY)
  } catch {
    return null
  }
}

export function RegisterCard({
  action,
  pending = false,
}: {
  action: RegisterAction
  pending?: boolean
}) {
  const [state, formAction] = useActionState(action, initial)

  // `useSyncExternalStore` y no `useState` + efecto: el snapshot del servidor es
  // `null` (no hay sessionStorage en SSR) y el del cliente se lee en el render,
  // así que no hay mismatch de hidratación ni un `setState` dentro de un efecto
  // (que la regla `react-hooks/set-state-in-effect` prohíbe, con razón).
  const storedEmail = useSyncExternalStore(subscribeNever, readPendingEmail, () => null)

  const confirmed = state.status === 'confirm'
  const confirmedEmail = state.status === 'confirm' ? state.email : null

  useEffect(() => {
    if (!confirmed || !confirmedEmail) return
    try {
      sessionStorage.setItem(PENDING_EMAIL_KEY, confirmedEmail)
    } catch {
      // Modo privado / storage lleno: el cartel sigue saliendo, sin el email.
    }
    // `replaceState` y no `router.replace`: no hace falta un round-trip al
    // servidor para dejar la marca, y evita re-montar la card ya renderizada.
    const url = new URL(window.location.href)
    url.searchParams.set('pending', '1')
    window.history.replaceState(null, '', url)
  }, [confirmed, confirmedEmail])

  if (state.status === 'confirm') return <ConfirmState email={state.email} />
  if (state.status === 'existing') return <ExistingState email={state.email} />
  if (pending && state.status === 'idle') return <ConfirmState email={storedEmail} />
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
  // Sin esto, cualquier error de validación le borra al dueño los 7 campos.
  const vals = state.status === 'error' ? state.values : {}

  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/4 dark:border-white/8 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <header className="mb-6 space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Creá tu cuenta</h1>
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
            defaultValue={vals.firstName}
          />
          <Field
            id="lastName"
            name="lastName"
            label="Apellido"
            autoComplete="family-name"
            error={errs.lastName}
            defaultValue={vals.lastName}
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
          defaultValue={vals.email}
        />
        <PhoneInput
          id="phone"
          name="phone"
          label="Celular"
          placeholder="11 1234-5678"
          error={errs.phone}
          defaultValue={vals.phone}
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
        <Link
          href="/login"
          className="font-semibold text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline"
        >
          Ingresar
        </Link>
      </p>
    </div>
  )
}

function ConfirmState({ email }: { email: string | null }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 dark:bg-white/4 dark:border-white/8 p-8 text-center shadow-xl shadow-slate-900/5 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Mail className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Confirmá tu email</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {email ? (
          <>
            Te enviamos un email a <strong className="text-foreground">{email}</strong>.
          </>
        ) : (
          <>Te enviamos un email.</>
        )}{' '}
        Hacé click en el enlace para activar tu cuenta; después entrás con tu contraseña.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        ¿No llegó? Revisá spam. Podés volver a{' '}
        <Link
          href="/register"
          className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          registrarte
        </Link>
        .
      </p>
    </div>
  )
}

function ExistingState({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 dark:bg-white/4 dark:border-white/8 p-8 text-center shadow-xl shadow-slate-900/5 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-700 dark:text-emerald-400" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
        Ya tenés una cuenta
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Ya existe una cuenta con <strong className="text-foreground">{email}</strong>. ¿Querés
        agregar otro complejo? Iniciá sesión y sumalo desde tu panel.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
  /** Repone lo tipeado cuando el server devuelve error (input NO controlado). */
  defaultValue?: string
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
        defaultValue={props.defaultValue}
        required
        aria-invalid={props.error ? 'true' : undefined}
        className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-invalid:border-red-500"
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
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <TgBallSpinner size="xs" className="mr-2" aria-hidden />
          Creando…
        </>
      ) : (
        'Crear cuenta'
      )}
    </button>
  )
}
