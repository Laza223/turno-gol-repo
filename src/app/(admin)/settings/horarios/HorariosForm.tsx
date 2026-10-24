'use client'

import { useActionState, useState } from 'react'
import { MoneyInput } from '@/components/ui/money-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { ScheduleFields } from '@/components/schedule/ScheduleFields'
import {
  deriveScheduleView,
  type LooseOpeningHours,
  type ScheduleView,
} from '@/lib/schedule/schedule-view'
import { horariosPriceField } from '@/modules/tenants/opening-hours.schema'
import { DAY_LABELS_LONG } from '@/shared/time/week-days'
import type { HorariosActionResult } from './actions'

const INITIAL: HorariosActionResult = { success: true }

const DAYS_LIST = new Intl.ListFormat('es-AR', { type: 'conjunction' })

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
  action,
}: {
  hours: LooseOpeningHours
  action: UpdateHorariosAction
}) {
  const [state, formAction] = useActionState(action, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)
  const [view, setView] = useState<ScheduleView>(() => deriveScheduleView(hours))
  // Controlado: el reset del form que hace React 19 tras cada submit no puede
  // borrar un precio que el dueño ya tipeó.
  const [prices, setPrices] = useState<Record<string, number | null>>({})
  const needsPrices = state.success ? undefined : state.needsPrices

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-4">
      {/* Sin closesNextDay/onClosesNextDayChange: en /settings/horarios el flag
          se deriva solo (Cambio 1, rediseño horarios) — no hay checkbox manual. */}
      <ScheduleFields view={view} onViewChange={setView} />

      {/* Un día abierto sin precio no se guarda (El Vagón, 2026-10-24): el turno
          se ve libre y nadie lo puede reservar. Se pide acá mismo, con la
          tarifa que más cobra cada cancha ya puesta pero a la vista. */}
      {needsPrices && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40"
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Falta el precio{' '}
              {DAYS_LIST.format(
                needsPrices.days.map((day) => `del ${DAY_LABELS_LONG[day].toLowerCase()}`),
              )}
              .
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Sin precio nadie puede reservar esos turnos, así que el horario todavía no se guardó.
              Te dejamos el precio que más cobrás en cada cancha: cambialo si es distinto y guardá.
            </p>
          </div>
          <ul className="space-y-2">
            {needsPrices.courts.map((court) => (
              <li key={court.id} className="flex items-center justify-between gap-3">
                <label
                  htmlFor={`horarios-precio-${court.id}`}
                  className="min-w-0 truncate text-sm font-medium"
                >
                  {court.name}
                </label>
                <MoneyInput
                  id={`horarios-precio-${court.id}`}
                  name={horariosPriceField(court.id)}
                  valueCents={
                    prices[court.id] !== undefined ? prices[court.id] : court.suggestedCents
                  }
                  onValueChange={(cents) => setPrices((prev) => ({ ...prev, [court.id]: cents }))}
                  minCents={100}
                  required
                  className="w-36"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2">
        <SubmitButton>
          {needsPrices ? 'Guardar horarios y precios' : 'Guardar horarios'}
        </SubmitButton>
      </div>
      <div aria-live="polite" className="min-h-5">
        {!state.success && !state.needsPrices && (
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
      </div>
    </form>
  )
}
