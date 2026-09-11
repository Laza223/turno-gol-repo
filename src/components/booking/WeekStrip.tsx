'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addDays, mondayOf } from '@/lib/booking/grid-cells'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

type Props = {
  /** Día seleccionado (YYYY-MM-DD): define la semana visible. */
  date: string
  /** Hoy en ART; string vacío antes de la hidratación (useArtNow). */
  todayArt: string
  onNavigate: (date: string) => void
}

/**
 * Navegación semanal de la grilla: 7 píldoras (lunes a domingo de la semana
 * del día seleccionado) + chevrons que saltan de a 7 días. El día actual
 * queda marcado aunque no esté seleccionado. Chevrons icon-only → tooltip
 * obligatorio (MASTER §7.4).
 *
 * Vive en la barra superior del panel, que mide 60 px: por eso las píldoras
 * miden 44 (el mínimo táctil) y no 48, y el bloque no se estira — se centra
 * junto al resto de los controles de la vista.
 */
export function WeekStrip({ date, todayArt, onNavigate }: Props) {
  const days = useMemo(() => {
    const monday = mondayOf(date)
    return WEEKDAY_LABELS.map((label, i) => {
      const day = addDays(monday, i)
      return { label, date: day, dayNum: day.slice(8, 10).replace(/^0/, '') }
    })
  }, [date])

  const chevronClass =
    'flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onNavigate(addDays(date, -7))}
            aria-label="Semana anterior"
            className={chevronClass}
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Semana anterior</TooltipContent>
      </Tooltip>

      {/* En pantallas angostas los 7 días no entran con touch targets de 44px:
          la tira scrollea internamente (nunca la página). */}
      <ul className="flex min-w-0 snap-x gap-0.5 overflow-x-auto">
        {days.map((day) => {
          const selected = day.date === date
          const isToday = day.date === todayArt
          return (
            <li key={day.date} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onNavigate(day.date)}
                aria-label={`${day.label} ${day.dayNum}${isToday ? ' (hoy)' : ''}`}
                aria-current={selected ? 'date' : undefined}
                className={cn(
                  'flex h-11 min-w-[52px] flex-col items-center justify-center rounded-lg px-2 transition-colors duration-150',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selected
                    ? // Token primary: emerald-700+blanco en light, emerald-500+slate-950 en dark (§2.4).
                      'bg-primary text-primary-foreground'
                    : isToday
                      ? 'bg-primary/10 text-emerald-800 ring-1 ring-inset ring-primary/50 hover:bg-primary/15 dark:text-emerald-300'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.04em]">
                  {day.label}
                </span>
                <span className="mt-[3px] text-[15px] font-semibold leading-none tabular-nums">
                  {day.dayNum}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onNavigate(addDays(date, 7))}
            aria-label="Semana siguiente"
            className={chevronClass}
          >
            <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Semana siguiente</TooltipContent>
      </Tooltip>
    </div>
  )
}
