'use client'

import { useFormState } from 'react-dom'
import { SubmitButton } from '@/components/ui/submit-button'
import { removeClosedDateAction, type HorariosActionResult } from './actions'

const INITIAL: HorariosActionResult = { success: true }

/** Form inline por fila para quitar un día cerrado (#19). */
export function RemoveClosedDateForm({ date }: { date: string }) {
  const [state, formAction] = useFormState(removeClosedDateAction, INITIAL)

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
