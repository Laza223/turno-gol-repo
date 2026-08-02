'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SubmitButton } from '@/components/ui/submit-button'
import { toast } from '@/hooks/use-toast'
import type { HorariosActionResult } from './actions'

const INITIAL: HorariosActionResult = { success: true }

/** Firma de removeClosedDateAction — ver comentario de DI en ReservasPolicyForm.tsx. */
export type RemoveClosedDateAction = (
  prevState: HorariosActionResult,
  formData: FormData,
) => Promise<HorariosActionResult>

export type AddClosedDateAction = (
  prevState: HorariosActionResult,
  formData: FormData,
) => Promise<HorariosActionResult>

/**
 * Form inline por fila para quitar un día cerrado (#19). La action entra por
 * PROP. `addAction` es OPCIONAL (mismo criterio que `getBookingChargesAction`
 * en QuickActions.tsx): sin ella (stories/callers viejos) el toast de éxito
 * no ofrece "Deshacer" — reversible barato, Clase A (visión v2 §6.2).
 */
export function RemoveClosedDateForm({
  date,
  action,
  addAction,
}: {
  date: string
  action: RemoveClosedDateAction
  addAction?: AddClosedDateAction
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(action, INITIAL)
  const seenStateRef = useRef(state)

  useEffect(() => {
    if (state === seenStateRef.current) return
    seenStateRef.current = state
    if (!state.success) return

    toast({
      title: 'Día cerrado quitado',
      description: date,
      variant: 'success',
      action: addAction
        ? {
            label: 'Deshacer',
            onClick: () => {
              const fd = new FormData()
              fd.append('date', date)
              void addAction(INITIAL, fd).then(() => router.refresh())
            },
          }
        : undefined,
    })
  }, [state, date, addAction, router])

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
