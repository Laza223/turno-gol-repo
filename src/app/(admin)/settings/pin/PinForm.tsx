'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { setPinAction, type PinConfigResult } from './actions'

const INITIAL: PinConfigResult = { success: true }

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [state, formAction] = useFormState(setPinAction, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form
      action={formAction}
      onSubmit={() => setDidSubmit(true)}
      className="space-y-4"
    >
      {hasPin && (
        <div className="space-y-1.5">
          <Label htmlFor="currentPin">PIN actual</Label>
          <Input
            id="currentPin"
            name="currentPin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            autoComplete="current-password"
            className="h-10"
            placeholder="••••"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="newPin">Nuevo PIN</Label>
        <Input
          id="newPin"
          name="newPin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4,8}"
          autoComplete="new-password"
          className="h-10"
          placeholder="••••"
        />
        <p className="text-xs text-slate-500">4 a 8 dígitos numéricos.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPin">Confirmar nuevo PIN</Label>
        <Input
          id="confirmPin"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4,8}"
          autoComplete="new-password"
          className="h-10"
          placeholder="••••"
        />
      </div>
      <SubmitButton pendingLabel="Procesando…" className="w-full bg-emerald-600 hover:bg-emerald-500">
        {hasPin ? 'Cambiar PIN' : 'Configurar PIN'}
      </SubmitButton>

      <div aria-live="polite" className="min-h-[1.25rem]">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600">{state.error}</p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700">PIN guardado correctamente.</p>
        )}
      </div>
    </form>
  )
}
