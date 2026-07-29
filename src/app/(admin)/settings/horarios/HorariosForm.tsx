'use client'

import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { ScheduleFields } from '@/components/schedule/ScheduleFields'
import {
  deriveScheduleView,
  type LooseOpeningHours,
  type ScheduleView,
} from '@/lib/schedule/schedule-view'
import type { HorariosActionResult } from './actions'

const INITIAL: HorariosActionResult = { success: true }

/** Firma de updateHorariosAction — ver comentario de DI en ReservasPolicyForm.tsx. */
export type UpdateHorariosAction = (
  prevState: HorariosActionResult,
  formData: FormData,
) => Promise<HorariosActionResult>

/**
 * Form de horarios "general + excepciones" (pages/horarios-precios.md §2):
 * un par Abre/Cierra que vale para todos los días + por día Personalizar o
 * Cerrado. Los campos viven en ScheduleFields (compartidos con el wizard de
 * onboarding); al submit se expanden a los 7 días vía hidden inputs.
 * La action entra por PROP (no se importa como valor).
 */
export function HorariosForm({
  hours,
  closesNextDay,
  action,
}: {
  hours: LooseOpeningHours
  closesNextDay: boolean
  action: UpdateHorariosAction
}) {
  const [state, formAction] = useActionState(action, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)
  const [view, setView] = useState<ScheduleView>(() => deriveScheduleView(hours))
  const [nextDay, setNextDay] = useState(closesNextDay)

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-4">
      <ScheduleFields
        view={view}
        onViewChange={setView}
        closesNextDay={nextDay}
        onClosesNextDayChange={setNextDay}
      />

      <div className="pt-2">
        <SubmitButton>Guardar horarios</SubmitButton>
      </div>
      <div aria-live="polite" className="min-h-5">
        {!state.success && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Horarios guardados.</p>
        )}
      </div>
    </form>
  )
}
