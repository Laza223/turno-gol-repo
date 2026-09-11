'use client'

import { ChevronLeft, ChevronRight, Coins, Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs } from '@/lib/format'
import { computeArtNow } from '@/hooks/use-art-now'
import { addDays } from '@/lib/booking/grid-cells'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WeekStrip } from '../WeekStrip'
import { GridLegend } from './GridLegend'

type Props = {
  date: string
  /** Fecha larga localizada, ya resuelta por el padre (ej. "vie 12 de junio"). */
  dateLabel: string
  /** Hoy en ART (useArtNow); string vacío antes de la hidratación. */
  todayArt: string
  onNavigate: (date: string) => void
  /** Lo que falta cobrar de los turnos visibles (BookingGrid, sumPendingCents). */
  pendingSummary?: { totalCents: number; count: number }
  /** Resaltar sólo los turnos que deben plata. Lo enciende el chip. */
  highlightPending: boolean
  onToggleHighlight: () => void
}

/**
 * Los controles de la Grilla, en la barra superior del panel.
 *
 * Antes eran cuatro filas propias arriba de la matriz —título "Grilla", la
 * fecha, las pestañas y la tira semanal— que se llevaban unos 180 px de alto en
 * una pantalla donde lo único que importa es ver más horas de una. El título y
 * la fecha se fueron (el riel dice dónde estás, y la tira dice qué día es), y el
 * resto sube al hueco que el armazón deja libre.
 *
 * Dos versiones porque son dos pantallas distintas: en escritorio entra la
 * semana completa en la barra; en el teléfono la barra ya está ocupada por la
 * marca, así que la navegación del día vive arriba de la matriz como
 * `‹ fecha ›`, que es lo que el pulgar alcanza.
 */
export function GridHeaderBar({
  date,
  dateLabel,
  todayArt,
  onNavigate,
  pendingSummary,
  highlightPending,
  onToggleHighlight,
}: Props) {
  const isToday = todayArt !== '' && date === todayArt
  const hasPending = !!pendingSummary && pendingSummary.count > 0

  // Se recalcula al click (no se usa `todayArt`) para no depender de la
  // hidratación ni del refresco de 60 s de useArtNow: evita quedar sin navegar
  // antes de hidratar y el desfasaje de hasta 60 s cruzando la medianoche ART.
  const goToday = () => onNavigate(computeArtNow().date)

  const pendingChip = hasPending ? (
    <button
      type="button"
      onClick={onToggleHighlight}
      aria-pressed={highlightPending}
      aria-label={`Por cobrar hoy: ${formatArs(pendingSummary.totalCents)} en ${pendingSummary.count} ${pendingSummary.count === 1 ? 'turno' : 'turnos'}. Resaltar esos turnos`}
      className={cn(
        // 44px en touch (MASTER §10): dejó de ser texto y ahora se toca. En
        // escritorio baja a 36 para entrar en la barra de 60.
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-full pl-2.5 pr-3 text-[13px] font-semibold whitespace-nowrap transition-colors lg:h-9',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        // red-700 y no el destructive pelado: el token cae bajo AA sobre este
        // fondo tenue en claro (ver globals.css / Tailwind 4 OKLCH).
        'bg-destructive/10 text-red-700 ring-1 ring-inset ring-destructive/25 hover:bg-destructive/15',
        'dark:bg-destructive/15 dark:text-red-300 dark:ring-destructive/40',
        highlightPending && 'bg-destructive/20 ring-2 dark:bg-destructive/25',
      )}
    >
      <Coins aria-hidden className="h-4 w-4 shrink-0" />
      <span>Por cobrar hoy</span>
      <span className="tabular-nums">{formatArs(pendingSummary.totalCents)}</span>
      <span className="font-medium opacity-80">· {pendingSummary.count}</span>
    </button>
  ) : null

  // La leyenda dejó de ser una fila fija al pie de la matriz: la lee alguien
  // nuevo durante su primera semana y después nadie, y ahí abajo le sacaba una
  // línea entera de alto a la grilla en 1366×768.
  const moreMenu = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Más opciones de la grilla"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Ellipsis aria-hidden className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          ¿Qué significa cada color?
        </p>
        <GridLegend />
      </PopoverContent>
    </Popover>
  )

  const todayButton = !isToday ? (
    <button
      type="button"
      onClick={goToday}
      className="ml-1.5 flex h-9 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      Hoy
    </button>
  ) : null

  return (
    <>
      <AdminHeaderSlot>
        <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
          <div className="flex-1" />
          <div className="flex shrink-0 items-center">
            <WeekStrip date={date} todayArt={todayArt} onNavigate={onNavigate} />
            {todayButton}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            {pendingChip}
            {moreMenu}
          </div>
        </div>
      </AdminHeaderSlot>

      {/* Teléfono: la barra superior ya está ocupada por la marca, así que el día
          se navega acá arriba de la matriz, donde llega el pulgar. */}
      <div className="shrink-0 lg:hidden">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onNavigate(addDays(date, -1))}
                aria-label="Día anterior"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft aria-hidden className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Día anterior</TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={goToday}
            aria-label={`${dateLabel}. Ir a hoy`}
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate text-base font-bold tracking-tight text-foreground">
              {dateLabel}
            </span>
            {isToday && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                hoy
              </span>
            )}
          </button>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onNavigate(addDays(date, 1))}
                aria-label="Día siguiente"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight aria-hidden className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Día siguiente</TooltipContent>
          </Tooltip>
        </div>

        {hasPending && <div className="mt-1 flex justify-center">{pendingChip}</div>}
      </div>
    </>
  )
}
