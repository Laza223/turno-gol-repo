'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { UpdateProfileResult } from './actions'
import { PhoneInput } from '@/components/ui/phone-input'

type DefaultValues = {
  firstName: string
  lastName: string
  phone: string
  preferredArea: string
  email: string
}

/** Firma de la Server Action que consume el form. */
type UpdateProfileAction = (
  prevState: UpdateProfileResult,
  formData: FormData,
) => Promise<UpdateProfileResult>

type Props = {
  defaultValues: DefaultValues
  /**
   * La action llega por PROP, no por import: './actions' es `'use server'` y
   * arrastra drizzle/postgres + `node:async_hooks` (vía request-context), lo
   * que rompe cualquier bundle de browser (Storybook) si se importa como
   * valor. El type import de `UpdateProfileResult` sí es seguro: se borra en
   * compilación.
   */
  action: UpdateProfileAction
}

const INITIAL_STATE: UpdateProfileResult = { success: true }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:hover:translate-y-0 dark:shadow-emerald-500/25"
    >
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  )
}

export function ProfileForm({ defaultValues, action }: Props) {
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form
      action={formAction}
      onSubmit={() => setDidSubmit(true)}
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xs"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="first_name" className="text-sm font-medium text-foreground">
            Nombre
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            defaultValue={defaultValues.firstName}
            autoComplete="given-name"
            required
            className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-emerald-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="last_name" className="text-sm font-medium text-foreground">
            Apellido
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            defaultValue={defaultValues.lastName}
            autoComplete="family-name"
            required
            className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-emerald-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>
      </div>

      <PhoneInput
        id="phone"
        name="phone"
        label="Teléfono"
        defaultValue={defaultValues.phone}
      />

      <div className="space-y-1">
        <label htmlFor="preferred_area" className="text-sm font-medium text-foreground">
          Zona preferida
        </label>
        <input
          id="preferred_area"
          name="preferred_area"
          type="text"
          defaultValue={defaultValues.preferredArea}
          placeholder="Ej: Palermo, Villa Crespo..."
          className="w-full h-11 px-3 border border-border bg-background rounded-md text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium text-foreground">Email</span>
        <div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3.5 text-sm text-muted-foreground">
          {defaultValues.email}
        </div>
        <p className="text-xs text-muted-foreground">El email no puede modificarse.</p>
      </div>

      <SubmitButton />

      {!state.success && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {state.error}
        </p>
      )}
      {didSubmit && state.success && (
        <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          Perfil actualizado
        </p>
      )}
    </form>
  )
}
