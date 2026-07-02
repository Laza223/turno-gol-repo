'use client'

import { Fragment, useState } from 'react'
import { useFormState } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { DAY_KEYS, DAY_LABELS_LONG, type DayKey } from '@/shared/time/week-days'
import {
  deriveScheduleView,
  effectiveDay,
  needsNextDayHint,
  type LooseOpeningHours,
  type ScheduleView,
} from './horarios-lib'
import {
  addClosedDateAction,
  removeClosedDateAction,
  updateHorariosAction,
  type HorariosActionResult,
} from './actions'

const INITIAL: HorariosActionResult = { success: true }

/**
 * Form de horarios "general + excepciones" (pages/horarios-precios.md §2):
 * un par Abre/Cierra que vale para todos los días + por día Personalizar o
 * Cerrado. Al submit se expande a los 7 días vía hidden inputs (los names
 * `${day}_open/_close/_closed` son el contrato con updateHorariosAction).
 */
export function HorariosForm({
  hours,
  closesNextDay,
}: {
  hours: LooseOpeningHours
  closesNextDay: boolean
}) {
  const [state, formAction] = useFormState(updateHorariosAction, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)
  const [view, setView] = useState<ScheduleView>(() => deriveScheduleView(hours))
  const [nextDay, setNextDay] = useState(closesNextDay)

  function setGeneral(field: 'open' | 'close', value: string) {
    setView((prev) => ({ ...prev, general: { ...prev.general, [field]: value } }))
  }

  function setDay(day: DayKey, patch: Partial<ScheduleView['days'][DayKey]>) {
    setView((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: { ...prev.days[day], ...patch } },
    }))
  }

  function toggleOpen(day: DayKey, open: boolean) {
    if (!open) {
      setDay(day, { mode: 'closed' })
      return
    }
    const d = view.days[day]
    const matchesGeneral = d.open === view.general.open && d.close === view.general.close
    setDay(day, { mode: matchesGeneral ? 'general' : 'custom' })
  }

  const showNextDayHint = needsNextDayHint(view, nextDay)

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-4">
      {/* Valores efectivos por día: contrato de persistencia (spec §2.3). */}
      {DAY_KEYS.map((day) => {
        const e = effectiveDay(view, day)
        return (
          <Fragment key={day}>
            <input type="hidden" name={`${day}_open`} value={e.open} />
            <input type="hidden" name={`${day}_close`} value={e.close} />
            {e.closed && <input type="hidden" name={`${day}_closed`} value="on" />}
          </Fragment>
        )
      })}

      {/* Horario general: el caso común son 2 campos, no 14. */}
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Horario general</p>
          <p className="text-xs text-muted-foreground">
            Vale para todos los días, salvo los que personalices abajo.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="general-open">Abre</Label>
            <Input
              id="general-open"
              type="time"
              value={view.general.open}
              onChange={(e) => setGeneral('open', e.target.value)}
              className="h-10 w-32"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="general-close">Cierra</Label>
            <Input
              id="general-close"
              type="time"
              value={view.general.close}
              onChange={(e) => setGeneral('close', e.target.value)}
              className="h-10 w-32"
            />
          </div>
        </div>
        {showNextDayHint && (
          <p className="rounded-md bg-info/10 px-3 py-2 text-xs text-blue-800 dark:bg-info/15 dark:text-blue-300">
            ¿Cerrás pasada la medianoche? Activá «Cierra después de medianoche» acá abajo.
          </p>
        )}
      </div>

      {/* Días: excepciones al general (Personalizar) o cerrados. */}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {DAY_KEYS.map((day) => {
          const d = view.days[day]
          const label = DAY_LABELS_LONG[day]
          const closed = d.mode === 'closed'
          return (
            <li key={day} className="flex min-h-[3rem] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <label className="flex w-28 shrink-0 cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={!closed}
                  onChange={(e) => toggleOpen(day, e.target.checked)}
                  aria-label={`${label} abierto`}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span
                  className={`text-sm font-medium ${closed ? 'text-muted-foreground' : 'text-foreground'}`}
                >
                  {label}
                </span>
              </label>

              {closed ? (
                <span className="text-sm text-muted-foreground">Cerrado</span>
              ) : d.mode === 'general' ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    {view.general.open} a {view.general.close} · horario general
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() =>
                      setDay(day, { mode: 'custom', open: view.general.open, close: view.general.close })
                    }
                  >
                    Personalizar
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={d.open}
                      onChange={(e) => setDay(day, { open: e.target.value })}
                      aria-label={`${label}: abre`}
                      className="h-9 w-28"
                    />
                    <span className="text-sm text-muted-foreground">a</span>
                    <Input
                      type="time"
                      value={d.close}
                      onChange={(e) => setDay(day, { close: e.target.value })}
                      aria-label={`${label}: cierra`}
                      className="h-9 w-28"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setDay(day, { mode: 'general' })}
                  >
                    Usar horario general
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {/* Día operativo: complejos que cierran después de medianoche. */}
      <label className="flex items-start gap-3 rounded-md border border-border p-3">
        <input
          type="checkbox"
          name="closes_next_day"
          checked={nextDay}
          onChange={(e) => setNextDay(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-emerald-600"
        />
        <span className="text-sm">
          <span className="font-medium text-foreground">Cierra después de medianoche</span>
          <span className="block text-muted-foreground">
            Activalo si algún día cerrás en la madrugada (ej. abrís 18:00 y cerrás
            02:00). Esos turnos cuentan como parte de la misma jornada (el día anterior).
          </span>
        </span>
      </label>

      <div className="pt-2">
        <SubmitButton>Guardar horarios</SubmitButton>
      </div>
      <div aria-live="polite" className="min-h-[1.25rem]">
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

/** Form para agregar un día cerrado (#19). */
export function AddClosedDateForm({ minDate }: { minDate: string }) {
  const [state, formAction] = useFormState(addClosedDateAction, INITIAL)
  const [didSubmit, setDidSubmit] = useState(false)

  return (
    <form action={formAction} onSubmit={() => setDidSubmit(true)} className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="closedDate">Agregar día cerrado</Label>
          <Input id="closedDate" name="date" type="date" className="h-10 w-48" min={minDate} />
        </div>
        <SubmitButton variant="outline" pendingLabel="Agregando…" className="h-10">
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
