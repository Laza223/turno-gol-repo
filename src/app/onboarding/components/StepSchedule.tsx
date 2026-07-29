'use client'

import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { ScheduleFields } from '@/components/schedule/ScheduleFields'
import {
  deriveScheduleView,
  type LooseOpeningHours,
  type ScheduleView,
} from '@/lib/schedule/schedule-view'
import { sanitizeWizardHours } from '../wizard-hours'
import type { WizardActionResult } from '../actions'

const INITIAL: WizardActionResult = { success: true }

/** Firma de la Server Action que consume el form. */
export type SaveWizardScheduleAction = (
  prevState: WizardActionResult,
  formData: FormData,
) => Promise<WizardActionResult>

type Props = {
  hours: LooseOpeningHours
  closesNextDay: boolean
  action: SaveWizardScheduleAction
}

/**
 * Paso 2 — Horarios (pages/onboarding.md §4). Mismo modelo "general +
 * excepciones" y mismos campos que /settings/horarios (ScheduleFields); los
 * defaults llegan saneados (sanitizeWizardHours) para que Continuar sin tocar
 * nada sea válido y 100% cubrible por el generador de precios del paso 3.
 */
export function StepSchedule({ hours, closesNextDay, action }: Props) {
  const [state, formAction] = useActionState(action, INITIAL)
  const [view, setView] = useState<ScheduleView>(() =>
    deriveScheduleView(sanitizeWizardHours(hours, closesNextDay)),
  )
  const [nextDay, setNextDay] = useState(closesNextDay)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Horarios</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ya cargamos un horario típico — cambiá solo lo que sea distinto en tu complejo.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <ScheduleFields
          view={view}
          onViewChange={setView}
          closesNextDay={nextDay}
          onClosesNextDayChange={setNextDay}
        />

        {!state.success && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <SubmitButton className="w-full" pendingLabel="Guardando…">
          Continuar
        </SubmitButton>
      </form>
    </div>
  )
}
