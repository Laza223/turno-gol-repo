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
      className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-md"
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
      className="space-y-4"
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
            className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
            className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
          defaultValue={defaultValues.phone}
          autoComplete="tel"
          className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
          className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Email</label>
        <div className="h-11 px-3 flex items-center border border-slate-200 rounded-md bg-slate-50 text-sm text-slate-500">
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
