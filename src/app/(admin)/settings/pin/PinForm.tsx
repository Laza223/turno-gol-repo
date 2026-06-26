'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setPinAction, type PinConfigResult } from './actions'

type Props = {
  hasPin: boolean
}

const INITIAL_STATE: PinConfigResult = { success: false, error: '' }

function SubmitButton({ hasPin }: { hasPin: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full bg-emerald-600 hover:bg-emerald-500"
    >
      {pending
        ? hasPin
          ? 'Cambiando…'
          : 'Configurando…'
        : hasPin
          ? 'Cambiar PIN'
          : 'Configurar PIN'}
    </Button>
  )
}

export function PinForm({ hasPin }: Props) {
  const [state, formAction] = useFormState(setPinAction, INITIAL_STATE)

  // El error vacío inicial (INITIAL_STATE) no debe pintarse como error real:
  // solo mostramos el alert cuando hay un mensaje no vacío.
  const errorMessage = !state.success && state.error ? state.error : null

  return (
    <form action={formAction} className="space-y-4">
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
        <p className="text-xs text-muted-foreground">4 a 8 dígitos numéricos.</p>
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

      <SubmitButton hasPin={hasPin} />

      {errorMessage && (
        <p role="alert" className="rounded-md bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30">
          {errorMessage}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-500/30">
          PIN actualizado correctamente.
        </p>
      )}
    </form>
  )
}
