'use client'

import { Fragment } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { DAY_KEYS, DAY_LABELS_LONG, type DayKey } from '@/shared/time/week-days'
import {
  effectiveDay,
  needsNextDayHint,
  type ScheduleView,
} from '@/lib/schedule/schedule-view'

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

  // Disclosure progresivo solo para el caso virgen: si el complejo YA tiene
  // excepciones por día o cierre post-medianoche, esconder esa config detrás
  // de un click se leería como "¿dónde se fue mi horario?" — arranca abierto.
  const hasAdvancedConfig =
    closesNextDay || DAY_KEYS.some((day) => view.days[day].mode !== 'general')

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
            ¿Cerrás pasada la medianoche? Activá «Cierra después de medianoche» en «Excepciones y
            detalles avanzados», más abajo.
          </p>
        )}
      </div>

      {/* Secundarios (Fase 3 UX, progressive disclosure): el caso común es el
          horario general solo — las excepciones por día y el día operativo se
          colapsan bajo un trigger. Los hidden inputs de arriba (valores
          efectivos por día) quedan FUERA de este bloque a propósito: son el
          contrato de persistencia con horariosFormDataToInput() y tienen que
          serializar sin depender de que el usuario haya abierto el panel. */}
      <Collapsible defaultOpen={hasAdvancedConfig}>
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0">
          Excepciones y detalles avanzados
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {/* Días: excepciones al general (Personalizar) o cerrados. */}
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {DAY_KEYS.map((day) => {
              const d = view.days[day]
              const label = DAY_LABELS_LONG[day]
              const closed = d.mode === 'closed'
              return (
                <li
                  key={day}
                  className={cn(
                    'flex flex-col justify-center gap-2 rounded-xl border p-3.5 shadow-xs transition-all duration-200 min-h-16',
                    closed
                      ? // Sin opacity-70: diluía --muted-foreground (ya al límite, 4.24:1
                        // sobre --muted sólido) por debajo de AA (3.21:1/2.67:1 medidos).
                        // bg-muted/30 solo alcanza para transmitir "cerrado".
                        'border-border bg-muted/30'
                      : 'border-border bg-card hover:border-emerald-600/30 hover:shadow-md'
                  )}
                >
                  {/* Fila Principal */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Envuelto en <label> (no <div>): el área tocable pasa de
                        16x16 (el <input> solo) a 44px de alto en mobile, y
                        clickear el nombre del día también togglea (semántica
                        correcta de <label>). aria-label en el input sigue
                        siendo el nombre accesible (gana sobre el texto del
                        label), sin anuncio duplicado. */}
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 md:min-h-0">
                      <input
                        type="checkbox"
                        checked={!closed}
                        onChange={(e) => toggleOpen(day, e.target.checked)}
                        aria-label={`${label} abierto`}
                        className="h-4 w-4 rounded border-border text-emerald-600 accent-emerald-600 cursor-pointer"
                      />
                      <span
                        className={cn(
                          'text-sm font-semibold transition-colors',
                          closed ? 'text-muted-foreground' : 'text-foreground'
                        )}
                      >
                        {label}
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      {closed ? (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground border border-border/50">
                          Cerrado
                        </span>
                      ) : d.mode === 'general' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-600/10">
                            {view.general.open} a {view.general.close}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 md:h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            onClick={() =>
                              setDay(day, {
                                mode: 'custom',
                                open: view.general.open,
                                close: view.general.close,
                              })
                            }
                          >
                            Personalizar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-11 md:h-7 px-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          onClick={() => setDay(day, { mode: 'general' })}
                        >
                          Restablecer
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Fila Secundaria (Solo si se personaliza y no está cerrado) */}
                  {!closed && d.mode === 'custom' && (
                    <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <span className="text-xs font-medium text-muted-foreground">
                        Horario propio:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          value={d.open}
                          onChange={(e) => setDay(day, { open: e.target.value })}
                          aria-label={`${label}: abre`}
                          className="h-11 md:h-8 w-[92px] md:w-[76px] text-xs px-2 py-1 text-center"
                        />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input
                          type="time"
                          value={d.close}
                          onChange={(e) => setDay(day, { close: e.target.value })}
                          aria-label={`${label}: cierra`}
                          className="h-11 md:h-8 w-[92px] md:w-[76px] text-xs px-2 py-1 text-center"
                        />
                      </div>
                    </div>
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
                Activalo si algún día cerrás en la madrugada (ej. abrís 18:00 y cerrás 02:00). Esos
                turnos cuentan como parte de la misma jornada (el día anterior).
              </span>
            </span>
          </label>
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
