'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  id?: string
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
  min?: string // YYYY-MM-DD
  placeholder?: string
  className?: string
}

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

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = 'Seleccionar fecha',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Determinar en qué mes/año arrancar la visualización del calendario
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      return new Date(y, m - 1, 1)
    }
    return new Date()
  })

  // Sincronizar mes visible con el value seleccionado si cambia externamente
  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      setViewDate(new Date(y, m - 1, 1))
    }
  }, [value])

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const { days, prevEmptySlots } = useMemo(() => {
    // Primer día del mes actual
    const firstDay = new Date(year, month, 1)
    // El getDay() de JS: 0=Domingo, 1=Lunes, etc.
    // Queremos que el lunes sea index 0:
    const firstDayIndex = (firstDay.getDay() + 6) % 7

    // Total de días en el mes actual
    const totalDays = new Date(year, month + 1, 0).getDate()

    return {
      prevEmptySlots: Array.from({ length: firstDayIndex }),
      days: Array.from({ length: totalDays }, (_, i) => i + 1),
    }
  }, [year, month])

  function selectDay(day: number) {
    const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(formatted)
    setOpen(false)
  }

  function changeMonth(offset: number) {
    setViewDate(new Date(year, month + offset, 1))
  }

  const formattedDisplay = useMemo(() => {
    if (!value) return ''
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }, [value])

  // Deshabilitar días menores que 'min'
  const isDateDisabled = (day: number) => {
    if (!min) return false
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr < min
  }

  const currentMonthLabel = `${MONTH_NAMES[month]} de ${year}`

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        id={id}
        onClick={() => setOpen(!open)}
        className={cn(
          'h-12 w-full rounded-xl border border-border bg-background text-sm text-foreground shadow-sm text-left flex items-center justify-between transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring',
          className,
          // Paddings de íconos: pr-8 (no 10) para que "dd/mm/aaaa" quepa en
          // columnas angostas de mobile sin truncar (§13.5).
          'pl-10 pr-8',
          !value && 'text-muted-foreground/70'
        )}
      >
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary z-10" aria-hidden />
        <span className="truncate">{formattedDisplay || placeholder}</span>
      </button>
      {/* Fuera del trigger: <button> dentro de <button> es HTML inválido y
          rompía la hidratación (el "1 error" del dev overlay en la landing). */}
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
          aria-label="Limpiar fecha"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute z-50 mt-1.5 w-[280px] rounded-2xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95">
          {/* Header del Calendario */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-lg border border-border/40 hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize">{currentMonthLabel}</span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-lg border border-border/40 hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS.map((d) => (
              <span key={d} className="text-xs font-semibold text-muted-foreground/75 py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Días del mes */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {prevEmptySlots.map((_, idx) => (
              <span key={`empty-${idx}`} className="py-1.5" />
            ))}
            {days.map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isSelected = value === dateStr
              const isDisabled = isDateDisabled(day)

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  disabled={isDisabled}
                  className={cn(
                    'text-xs py-1.5 font-medium rounded-lg transition-all duration-150',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'hover:bg-accent hover:text-accent-foreground text-foreground/90',
                    isDisabled && 'opacity-25 pointer-events-none'
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Acciones del pie */}
          <div className="flex items-center justify-between border-t border-border/40 mt-3 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline px-1 py-0.5"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date()
                const formatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                onChange(formatted)
                setOpen(false)
              }}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline px-1 py-0.5"
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
