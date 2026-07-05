'use client'

import { Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WeekStrip } from '../WeekStrip'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Props = {
  date: string
  /** Etiqueta corta del día (Lun, Mar…) ya resuelta por el padre. */
  dayLabel: string
  /** Fecha larga localizada (ej. "12 de junio"). */
  dateLabel: string
  /** Hoy en ART (useArtNow); string vacío antes de la hidratación. */
  todayArt: string
  isCompact: boolean
  onToggleDensity: () => void
  onNavigate: (date: string) => void
}

/**
 * Header sticky de la grilla: título + fecha, toggle de densidad, botón "Hoy" y
 * la tira semanal. Queda a mano mientras la grilla scrollea (fondo sólido para
 * tapar el contenido que pasa por debajo del admin header fijo de 4rem).
 */
export function GridToolbar({
  date,
  dayLabel,
  dateLabel,
  todayArt,
  isCompact,
  onToggleDensity,
  onNavigate,
}: Props) {
  return (
    <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 space-y-3 bg-background/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Grilla</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dayLabel} {dateLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleDensity}
                aria-pressed={isCompact}
                aria-label="Cambiar densidad de la grilla"
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 md:min-h-9',
                  isCompact
                    ? 'border-emerald-600/40 bg-primary/10 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-border bg-card text-foreground hover:bg-accent',
                )}
              >
                <Rows3 aria-hidden className="h-4 w-4" />
                <span className="hidden sm:inline">{isCompact ? 'Compacto' : 'Cómodo'}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Alto de las filas: cómodo o compacto</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => {
              const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
              onNavigate(today)
            }}
            className="min-h-11 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent md:min-h-9"
          >
            Hoy
          </button>
        </div>
      </div>
      <WeekStrip date={date} todayArt={todayArt} onNavigate={onNavigate} />
    </div>
  )
}
