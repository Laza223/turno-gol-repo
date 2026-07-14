'use client'

import { useFormStatus } from 'react-dom'
import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import type { ResetState } from './actions'

const initial: ResetState = { status: 'idle' }

/** Firma de la Server Action que consume el form. */
export type ResetPasswordAction = (
  prevState: ResetState,
  formData: FormData,
) => Promise<ResetState>

/**
 * La action llega por PROP, no por import: './actions' es `'use server'` y
 * arrastra drizzle/postgres + `node:async_hooks` (vía request-context), lo
 * que rompe cualquier bundle de browser (Storybook) si se importa como
 * valor. El type import de `ResetState` sí es seguro: se borra en
 * compilación.
 */
export function ResetForm({ action }: { action: ResetPasswordAction }) {
  const [state, formAction] = useActionState(action, initial)
  const [show, setShow] = useState(false)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Nueva contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            placeholder="Mínimo 8 caracteres"
            aria-invalid={state.status === 'error' ? 'true' : undefined}
            className="h-11 w-full rounded-lg border border-border bg-card px-3.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-invalid:border-red-500"
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

      <div className="space-y-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
          Repetir contraseña
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          placeholder="Repetí la contraseña"
          aria-invalid={state.status === 'error' ? 'true' : undefined}
          className="h-11 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-invalid:border-red-500"
        />
      </div>

      {state.status === 'error' && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <SubmitButton />
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
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Guardando…
        </>
      ) : (
        'Guardar contraseña'
      )}
    </button>
  )
}
