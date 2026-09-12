'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, Moon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { TONE_TEXT, TONE_TINT } from '@/lib/status-tone'
import { DAY_KEYS, DAY_LABELS_LONG, type DayKey } from '@/shared/time/week-days'
import { effectiveCloseMins, END_OF_DAY_MINS } from '@/shared/time/operating-day'
import { effectiveDay, needsNextDayHint, type ScheduleView } from '@/lib/schedule/schedule-view'

type Props = {
  view: ScheduleView
  onViewChange: (view: ScheduleView) => void
}

/**
 * Resumen legible de las excepciones por día respecto al horario general —
 * summary del Collapsible en modo derivado (/settings/horarios):
 * "Sábado 15:00–02:00 · Domingo cerrado". Sin excepciones, avisa que rige el
 * horario general para los 7 días.
 */
function describeExceptions(view: ScheduleView): string {
  const exceptions = DAY_KEYS.filter((day) => view.days[day].mode !== 'general')
  if (exceptions.length === 0) return 'Todos los días con el horario general'
  return exceptions
    .map((day) => {
      const d = view.days[day]
      const label = DAY_LABELS_LONG[day]
      return d.mode === 'closed' ? `${label} cerrado` : `${label} ${d.open}–${d.close}`
    })
    .join(' · ')
}

/**
 * Campos del form de horarios "general + excepciones" (pages/horarios-precios.md
 * §2), compartidos por /settings/horarios y el wizard de onboarding. Controlado:
 * el estado vive en el form contenedor. Expande los valores efectivos a los 7
 * días vía hidden inputs — los names `${day}_open/_close/_closed` son el
 * contrato con horariosFormDataToInput().
 *
 * `closesNextDay` (día operativo) ya NO es un campo editable acá: se DERIVA
 * siempre de los pares open/close de los días (`deriveClosesNextDay` en
 * opening-hours.schema.ts es quien realmente decide qué se persiste). El
 * checkbox manual que existía existió hasta el rediseño de Configuración
 * (2026-09) tanto acá como en el wizard de onboarding — se sacó de los dos
 * lugares a la vez: un checkbox que el server podía terminar ignorando (si no
 * coincidía con lo que los horarios cargados amerita) es peor que no tenerlo.
 */
export function ScheduleFields({ view, onViewChange }: Props) {
  const effectiveClosesNextDay = needsNextDayHint(view, false)
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

  // H165: el editor por día (inputs "Horario propio") es un disclosure propio,
  // desacoplado del `mode` — antes un día que YA traía horario custom (ej. el
  // fin de semana en el seed) nacía con la fila expandida mientras el resto
  // arrancaba colapsado con "Personalizar": misma lista, dos estructuras
  // visuales distintas para el mismo tipo de fila (Nielsen #4). Todas arrancan
  // colapsadas por igual; "Personalizar" es lo único que abre el editor.
  const [expandedDays, setExpandedDays] = useState<ReadonlySet<DayKey>>(() => new Set())

  function personalizeDay(day: DayKey) {
    const d = view.days[day]
    if (d.mode === 'general') {
      setDay(day, { mode: 'custom', open: view.general.open, close: view.general.close })
    }
    setExpandedDays((prev) => new Set(prev).add(day))
  }

  function resetDay(day: DayKey) {
    setDay(day, { mode: 'general' })
    setExpandedDays((prev) => {
      const next = new Set(prev)
      next.delete(day)
      return next
    })
  }

  // Disclosure progresivo solo para el caso virgen: si el complejo YA tiene
  // excepciones por día o cierre post-medianoche, esconder esa config detrás
  // de un click se leería como "¿dónde se fue mi horario?" — arranca abierto.
  const hasAdvancedConfig =
    effectiveClosesNextDay || DAY_KEYS.some((day) => view.days[day].mode !== 'general')

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
        {/* Sin checkbox que activar: esto es la explicación de lo que ya se
            detectó en el horario cargado. */}
        {effectiveClosesNextDay && (
          <p
            className={cn(
              'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
              TONE_TINT.info,
              TONE_TEXT.info,
            )}
          >
            <Moon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Cerrás pasada la medianoche: los turnos de la madrugada aparecen dentro del día
              anterior, en la Grilla y en lo que ve el jugador.
            </span>
          </p>
        )}
      </div>

      {/* Secundarios (Fase 3 UX, progressive disclosure): el caso común es el
          horario general solo — las excepciones por día (y, en modo manual, el
          día operativo) se colapsan bajo un trigger. Los hidden inputs de arriba
          (valores efectivos por día) quedan FUERA de este bloque a propósito:
          son el contrato de persistencia con horariosFormDataToInput() y tienen
          que serializar sin depender de que el usuario haya abierto el panel. */}
      <Collapsible defaultOpen={hasAdvancedConfig}>
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0">
          <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
            <span>Excepciones por día</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {describeExceptions(view)}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {/* Días: excepciones al general (Personalizar) o cerrados. */}
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {DAY_KEYS.map((day) => {
              const d = view.days[day]
              const label = DAY_LABELS_LONG[day]
              const closed = d.mode === 'closed'
              const expanded = expandedDays.has(day)
              // Mismo criterio que effectiveCloseMins (operating-day.ts): con
              // "Cierra después de medianoche" activo, un cierre <= apertura
              // (excepto '00:00', que YA es fin de día) cruza a la madrugada
              // del día calendario siguiente.
              const eff = effectiveDay(view, day)
              const crossesMidnight =
                !closed &&
                effectiveClosesNextDay &&
                effectiveCloseMins(eff.open, eff.close, effectiveClosesNextDay) > END_OF_DAY_MINS
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
                      : 'border-border bg-card hover:border-emerald-600/30 hover:shadow-md',
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
                          closed ? 'text-muted-foreground' : 'text-foreground',
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
                      ) : expanded ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-11 md:h-7 px-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          onClick={() => resetDay(day)}
                        >
                          Restablecer
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-600/10">
                            {d.mode === 'custom'
                              ? `${d.open} a ${d.close}`
                              : `${view.general.open} a ${view.general.close}`}
                          </span>
                          {crossesMidnight && (
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                              title="Este cierre cruza a la madrugada del día siguiente"
                            >
                              +1 día
                            </Badge>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 md:h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            onClick={() => personalizeDay(day)}
                          >
                            Personalizar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fila Secundaria: solo con el editor de este día abierto
                      (H165 — el disclosure ya no lo decide el `mode`, sino
                      `expanded`; "Personalizar" siempre lleva a mode 'custom'). */}
                  {!closed && expanded && (
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
                        {crossesMidnight && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            title="Este cierre cruza a la madrugada del día siguiente"
                          >
                            +1 día
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
