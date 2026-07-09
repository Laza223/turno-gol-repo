'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { addClosedDateAction, type HorariosActionResult } from './actions'

const INITIAL: HorariosActionResult = { success: true }

/** Form para agregar un día cerrado (#19). */
export function AddClosedDateForm({ minDate }: { minDate: string }) {
  const [state, formAction] = useFormState(addClosedDateAction, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="closedDate">Agregar día cerrado</Label>
          <Input id="closedDate" name="date" type="date" className="w-48" min={minDate} />
        </div>
        <SubmitButton variant="outline" pendingLabel="Agregando…">
          Agregar
        </SubmitButton>
      </div>
      <div aria-live="polite" className="min-h-[1.25rem]">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Día agregado.</p>
        )}
      </div>
    </form>
  )
}
