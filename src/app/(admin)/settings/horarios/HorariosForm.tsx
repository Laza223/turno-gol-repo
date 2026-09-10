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
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {didSubmit && state.success && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Horarios guardados.
            {state.pricingFilled && (
              <>
                {' '}
                Completamos {state.pricingFilled.cells} horario
                {state.pricingFilled.cells === 1 ? '' : 's'} sin precio en{' '}
                {state.pricingFilled.courts} cancha
                {state.pricingFilled.courts === 1 ? '' : 's'} con el de la hora de al lado.
                Revisalos en{' '}
                <a href="/canchas" className="font-medium underline underline-offset-2">
                  Canchas
                </a>
                .
              </>
            )}
          </p>
        )}
        {/* Los huecos que el sistema NO completó solo (habría tenido que traer
            una tarifa de otro día, y esa decisión es del dueño) son turnos que
            hoy nadie puede reservar: van aparte y con la acción encima, no
            escondidos dentro del "Horarios guardados" en verde. */}
        {didSubmit && state.success && state.pricingPending && (
          <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Quedaron {state.pricingPending.cells} horario
            {state.pricingPending.cells === 1 ? '' : 's'} sin precio en{' '}
            {state.pricingPending.courts} cancha
            {state.pricingPending.courts === 1 ? '' : 's'}. Hasta que les pongas precio, esos turnos
            no se pueden reservar:{' '}
            <a href="/canchas" className="font-semibold underline underline-offset-2">
              cargalos en Canchas
            </a>
            .
          </p>
        )}
      </div>
    </form>
  )
}
