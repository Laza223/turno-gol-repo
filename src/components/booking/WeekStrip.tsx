'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addDays } from '@/lib/booking/grid-cells'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Índice = `Date#getUTCDay()` (0 = domingo), igual que `addDays`. */
const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
/** Cabecera del mini-calendario: lunes primero, convención AR (igual que date-picker.tsx). */
const CALENDAR_WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Cuántos días antes del seleccionado entran en la tira (el resto, después). */
const DAYS_BEFORE = 2
const STRIP_LENGTH = 7

function weekdayShort(dateStr: string): string {
  return WEEKDAY_SHORT[new Date(`${dateStr}T12:00:00Z`).getUTCDay()]
}

/** `{year, month}` (month 0-indexed) del mes que contiene `dateStr`. */
function monthOf(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split('-').map(Number)
  return { year: y, month: m - 1 }
}

/** Normaliza un mes fuera de rango (-1 o 12) corriendo el año, como haría un `Date`. */
function normalizeMonth(year: number, month: number): { year: number; month: number } {
  const d = new Date(year, month, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

type Props = {
  /** Día seleccionado (YYYY-MM-DD): centro de la tira. */
  date: string
  /** Hoy en ART; string vacío antes de la hidratación (useArtNow). */
  todayArt: string
  onNavigate: (date: string) => void
}

/**
 * Navegación de la grilla: 7 píldoras (2 días antes del seleccionado + el
 * resto adelante — no la semana calendario, así que el seleccionado queda
 * cerca del borde izquierdo y no pegado al derecho) + chevrons que saltan de
 * a 7 días + un calendario desplegable para saltar directo a cualquier fecha
 * (evita repetir el chevron para llegar a, por ejemplo, dentro de 6 semanas).
 * El día actual queda marcado aunque no esté seleccionado. Icon-only →
 * tooltip obligatorio (MASTER §7.4).
 *
 * Vive en la barra superior del panel, que mide 60 px: por eso las píldoras
 * miden 44 (el mínimo táctil) y no 48, y el bloque no se estira — se centra
 * junto al resto de los controles de la vista.
 */
export function WeekStrip({ date, todayArt, onNavigate }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => monthOf(date))

  const days = useMemo(() => {
    const start = addDays(date, -DAYS_BEFORE)
    return Array.from({ length: STRIP_LENGTH }, (_, i) => {
      const day = addDays(start, i)
      return { label: weekdayShort(day), date: day, dayNum: day.slice(8, 10).replace(/^0/, '') }
    })
  }, [date])

  const { year, month } = viewMonth
  const { calendarDays, prevEmptySlots } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const firstDayIndex = (firstDay.getDay() + 6) % 7 // lunes = índice 0
    const totalDays = new Date(year, month + 1, 0).getDate()
    return {
      prevEmptySlots: Array.from({ length: firstDayIndex }),
      calendarDays: Array.from({ length: totalDays }, (_, i) => i + 1),
    }
  }, [year, month])

  function selectCalendarDay(day: number) {
    onNavigate(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    setCalendarOpen(false)
  }

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

      <Popover
        open={calendarOpen}
        onOpenChange={(open) => {
          setCalendarOpen(open)
          // Reabre siempre mostrando el mes del día seleccionado, no el último
          // mes en el que se quedó navegando la vez anterior.
          if (open) setViewMonth(monthOf(date))
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Elegir fecha" className={chevronClass}>
                <CalendarDays aria-hidden className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Elegir fecha</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={6}
          aria-label="Elegir fecha"
          className="w-[280px] p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setViewMonth(({ year: y, month: m }) => normalizeMonth(y, m - 1))}
              className="flex items-center justify-center min-h-11 min-w-11 md:min-h-9 md:min-w-9 rounded-lg border border-border/40 hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize">
              {MONTH_NAMES[month]} de {year}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(({ year: y, month: m }) => normalizeMonth(y, m + 1))}
              className="flex items-center justify-center min-h-11 min-w-11 md:min-h-9 md:min-w-9 rounded-lg border border-border/40 hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {CALENDAR_WEEKDAYS.map((d, i) => (
              // Se indexa por posición, no por letra ("L" no es única), para
              // que la key sea única.
              <span key={i} className="text-xs font-semibold text-muted-foreground/75 py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {prevEmptySlots.map((_, idx) => (
              <span key={`empty-${idx}`} className="py-1.5" />
            ))}
            {calendarDays.map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isSelected = date === dateStr
              const isToday = todayArt === dateStr
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectCalendarDay(day)}
                  aria-current={isSelected ? 'date' : undefined}
                  className={cn(
                    'text-xs min-h-11 md:min-h-9 flex items-center justify-center font-medium rounded-lg transition-all duration-150',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                      : isToday
                        ? 'ring-1 ring-inset ring-primary/50 text-emerald-800 dark:text-emerald-300 hover:bg-accent'
                        : 'hover:bg-accent hover:text-accent-foreground text-foreground/90',
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
