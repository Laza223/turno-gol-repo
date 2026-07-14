'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import type { HorariosActionResult } from './actions'

const INITIAL: HorariosActionResult = { success: true }

/** Firma de removeClosedDateAction — ver comentario de DI en ReservasPolicyForm.tsx. */
export type RemoveClosedDateAction = (
  prevState: HorariosActionResult,
  formData: FormData,
) => Promise<HorariosActionResult>

/** Form inline por fila para quitar un día cerrado (#19). La action entra por PROP. */
export function RemoveClosedDateForm({
  date,
  action,
}: {
  date: string
  action: RemoveClosedDateAction
}) {
  const [state, formAction] = useActionState(action, INITIAL)

  return (
    <form action={formAction} className="text-right">
      <input type="hidden" name="date" value={date} />
      <SubmitButton
        variant="ghost"
        size="sm"
        pendingLabel="Quitando…"
        className="text-red-600 dark:text-red-400 hover:text-red-700"
      >
        Quitar
      </SubmitButton>
      {!state.success && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  )
}
