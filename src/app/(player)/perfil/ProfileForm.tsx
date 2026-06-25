'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { updateProfileAction, type UpdateProfileResult } from './actions'

type DefaultValues = {
  firstName: string
  lastName: string
  phone: string
  preferredArea: string
  email: string
}

type Props = {
  defaultValues: DefaultValues
}

const INITIAL_STATE: UpdateProfileResult = { success: true }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 active:scale-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:hover:translate-y-0"
    >
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  )
}

export function ProfileForm({ defaultValues }: Props) {
  const [state, formAction] = useFormState(updateProfileAction, INITIAL_STATE)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form
      action={formAction}
      onSubmit={() => setDidSubmit(true)}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="first_name" className="text-sm font-medium text-slate-700">
            Nombre
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            defaultValue={defaultValues.firstName}
            autoComplete="given-name"
            required
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="last_name" className="text-sm font-medium text-slate-700">
            Apellido
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            defaultValue={defaultValues.lastName}
            autoComplete="family-name"
            required
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="text-sm font-medium text-slate-700">
          Teléfono
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={defaultValues.phone}
          autoComplete="tel"
          className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="preferred_area" className="text-sm font-medium text-slate-700">
          Zona preferida
        </label>
        <input
          id="preferred_area"
          name="preferred_area"
          type="text"
          defaultValue={defaultValues.preferredArea}
          placeholder="Ej: Palermo, Villa Crespo..."
          className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Email</label>
        <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-500">
          {defaultValues.email}
        </div>
        <p className="text-xs text-slate-400">El email no puede modificarse.</p>
      </div>

      <SubmitButton />

      {!state.success && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {didSubmit && state.success && (
        <p role="status" className="text-xs text-emerald-700">
          Perfil actualizado
        </p>
      )}
    </form>
  )
}
