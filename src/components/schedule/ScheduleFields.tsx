'use client'

import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DAY_KEYS, DAY_LABELS_LONG, type DayKey } from '@/shared/time/week-days'
import {
  effectiveDay,
  needsNextDayHint,
  type ScheduleView,
} from '@/app/(admin)/settings/horarios/horarios-lib'

type Props = {
  view: ScheduleView
  onViewChange: (view: ScheduleView) => void
  closesNextDay: boolean
  onClosesNextDayChange: (value: boolean) => void
}

/**
 * Campos del form de horarios "general + excepciones" (pages/horarios-precios.md
 * §2), compartidos por /settings/horarios y el wizard de onboarding. Controlado:
 * el estado vive en el form contenedor. Expande los valores efectivos a los 7
 * días vía hidden inputs — los names `${day}_open/_close/_closed` +
 * `closes_next_day` son el contrato con horariosFormDataToInput().
 */
export function ScheduleFields({
  view,
  onViewChange,
  closesNextDay,
  onClosesNextDayChange,
}: Props) {
  function setGeneral(field: 'open' | 'close', value: string) {
    onViewChange({ ...view, general: { ...view.general, [field]: value } })
  }

  function setDay(day: DayKey, patch: Partial<ScheduleView['days'][DayKey]>) {
    onViewChange({
      ...view,
      days: { ...view.days, [day]: { ...view.days[day], ...patch } },
    })
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

  const showNextDayHint = needsNextDayHint(view, closesNextDay)

  return (
    <>
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
              className="h-11 w-32 md:h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="general-close">Cierra</Label>
            <Input
              id="general-close"
              type="time"
              value={view.general.close}
              onChange={(e) => setGeneral('close', e.target.value)}
              className="h-11 w-32 md:h-10"
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
                      className="h-11 w-28 md:h-9"
                    />
                    <span className="text-sm text-muted-foreground">a</span>
                    <Input
                      type="time"
                      value={d.close}
                      onChange={(e) => setDay(day, { close: e.target.value })}
                      aria-label={`${label}: cierra`}
                      className="h-11 w-28 md:h-9"
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
          checked={closesNextDay}
          onChange={(e) => onClosesNextDayChange(e.target.checked)}
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
    </>
  )
}
