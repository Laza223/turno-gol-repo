'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addDays, mondayOf } from '@/lib/booking/grid-cells'

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
 * queda marcado aunque no esté seleccionado.
 */
export function WeekStrip({ date, todayArt, onNavigate }: Props) {
  const days = useMemo(() => {
    const monday = mondayOf(date)
    return WEEKDAY_LABELS.map((label, i) => {
      const day = addDays(monday, i)
      return { label, date: day, dayNum: day.slice(8, 10).replace(/^0/, '') }
    })
  }, [date])

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onNavigate(addDays(date, -7))}
        aria-label="Semana anterior"
        className="flex h-11 w-11 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors duration-150 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
      </button>

      {/* En mobile los 7 días no entran con touch targets de 44px: la tira
          scrollea internamente (nunca la página). */}
      <ul className="flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto sm:justify-center">
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
                  'flex h-12 min-w-11 flex-col items-center justify-center rounded-lg px-2 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
                  selected
                    ? 'bg-emerald-600 text-white'
                    : isToday
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <span className="text-[10px] font-medium uppercase leading-none">
                  {day.label}
                </span>
                <span className="mt-1 text-sm font-semibold leading-none tabular-nums">
                  {day.dayNum}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => onNavigate(addDays(date, 7))}
        aria-label="Semana siguiente"
        className="flex h-11 w-11 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors duration-150 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <ChevronRight aria-hidden className="h-4 w-4" />
      </button>
    </div>
  )
}
