'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { ScheduleFields } from '@/components/schedule/ScheduleFields'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import { useWizardNavigation } from './use-wizard-navigation'
import {
  deriveScheduleView,
  type LooseOpeningHours,
  type ScheduleView,
} from '@/lib/schedule/schedule-view'
import { sanitizeWizardHours } from '../wizard-hours'
import type { WizardActionResult } from '../actions'
import { WizardShell } from './WizardShell'
import { WeekPreview } from './WeekPreview'

// Sin `next`: el estado inicial no debe disparar la navegación al montar.
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
  const navigate = useWizardNavigation()

  // F-019: el error del server quedaba en pantalla DESPUÉS de corregir el
  // horario (o de activar "cierra después de medianoche"), así que el paso se
  // leía como bloqueado cuando ya era válido. Misma clase que F-010. Cualquier
  // cambio del formulario lo oculta; el próximo submit lo vuelve a decidir.
  const [touchedSinceError, setTouchedSinceError] = useState(false)
  const showError = !state.success && !touchedSinceError

  // El paso avanza cuando la action devuelve a dónde ir, no cuando el server
  // redirige: la navegación la maneja el cliente (ver use-wizard-navigation).
  useEffect(() => {
    if (state.success && state.next) navigate(state)
  }, [state, navigate])

  return (
    <WizardShell
      previewTitle="Tu semana"
      preview={<WeekPreview view={view} closesNextDay={nextDay} />}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Horarios</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ya cargamos un horario típico — cambiá solo lo que sea distinto en tu complejo.
          </p>
        </div>

        <form
          action={formAction}
          onSubmit={() => setTouchedSinceError(false)}
          className="space-y-4"
        >
          <ScheduleFields
            view={view}
            onViewChange={(v) => {
              setTouchedSinceError(true)
              setView(v)
            }}
            closesNextDay={nextDay}
            onClosesNextDayChange={(v) => {
              setTouchedSinceError(true)
              setNextDay(v)
            }}
          />

          {showError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}

          {/* Único paso sin salida hacia atrás: desde Horarios no había forma de
            corregir el nombre o la dirección del complejo, ni acá ni después
            (ninguna pantalla de Configuración edita esos campos todavía). */}
          <div className="flex items-center gap-3">
            <Link href={stepPath(1)} className={buttonVariants({ variant: 'ghost' })}>
              Volver
            </Link>
            <SubmitButton className="flex-1" pendingLabel="Guardando…">
              Continuar
            </SubmitButton>
          </div>
        </form>
      </div>
    </WizardShell>
  )
}
