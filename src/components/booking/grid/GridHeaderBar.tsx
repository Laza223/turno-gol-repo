'use client'

import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs } from '@/lib/format'
import { PENDING_CHARGE_BADGE } from '@/lib/booking/slot-visual'
import { TONE_BADGE } from '@/lib/status-tone'
import { computeArtNow } from '@/hooks/use-art-now'
import { addDays } from '@/lib/booking/grid-cells'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WeekStrip } from '../WeekStrip'
import { GridLegend } from './GridLegend'

type Props = {
  date: string
  /** Fecha larga localizada, ya resuelta por el padre (ej. "Vie 12 de junio"). */
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
 * "Viernes 25 de septiembre" — el weekday completo (el padre solo pasa la
 * versión corta "Vie", que alcanza para la fila compacta del teléfono pero no
 * para el botón centrado del escritorio).
 */
function longWeekdayLabel(date: string): string {
  const raw = new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  // es-AR escribe "viernes, 25 de septiembre": la coma sobra en un título.
  const clean = raw.replace(',', '')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/**
 * El botón de fecha, compartido por escritorio y teléfono (solo cambia la
 * tipografía): abre un Popover con la `WeekStrip` (saltar dentro de la
 * semana) y un `<input type="date">` nativo (cualquier otro día). Reemplaza
 * al mini-calendario a mano que traía `WeekStrip` — más simple y con el
 * picker nativo del sistema en el teléfono.
 */
function DateButton({
  date,
  label,
  shortLabel,
  todayArt,
  isToday,
  compact,
  onNavigate,
}: {
  date: string
  label: string
  /** Escritorio angosto (debajo de `xl`): la fecha larga pisaría el segmento de la izquierda. */
  shortLabel?: string
  todayArt: string
  isToday: boolean
  compact: boolean
  onNavigate: (date: string) => void
}) {
  const [open, setOpen] = useState(false)
  const jump = (d: string) => {
    onNavigate(d)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}. Elegir otra fecha`}
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-lg transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'h-11 flex-1 justify-center px-2 py-2' : 'h-9 shrink-0 px-3',
          )}
        >
          <span
            className={cn(
              'truncate font-semibold text-foreground',
              compact ? 'text-sm' : 'text-sm whitespace-nowrap',
            )}
          >
            {shortLabel ? (
              <>
                <span className="hidden xl:inline">{label}</span>
                <span className="xl:hidden">{shortLabel}</span>
              </>
            ) : (
              label
            )}
          </span>
          {isToday && (
            <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Hoy
            </span>
          )}
          <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-auto p-3">
        <WeekStrip date={date} todayArt={todayArt} onNavigate={jump} />
        <div className="mt-3 border-t border-border pt-3">
          <label
            htmlFor="grilla-date-input"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Ir a otra fecha
          </label>
          <input
            id="grilla-date-input"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) jump(e.target.value)
            }}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Los controles de la Grilla, en la barra superior del panel.
 *
 * Variante "Entra entera" (decisión del dueño, 2026-09-25): la fecha se centra
 * en la barra (`absolute left-1/2 -translate-x-1/2` dentro del hueco de
 * {@link AdminHeaderSlot}, que ahora es `relative`) con `‹ [fecha] ›` a los
 * costados — la semana completa que mostraba `WeekStrip` inline se mudó
 * adentro del Popover que abre al tocar la fecha, junto con un date-picker
 * nativo para saltar a cualquier día.
 *
 * Dos versiones porque son dos pantallas distintas: en escritorio entra
 * `‹ fecha › + chip + menú` en la barra; en el teléfono la barra ya está
 * ocupada por la marca, así que la fila vive arriba de la matriz.
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
  const PendingIcon = PENDING_CHARGE_BADGE.icon

  // Se recalcula al click (no se usa `todayArt`) para no depender de la
  // hidratación ni del refresco de 60 s de useArtNow: evita quedar sin navegar
  // antes de hidratar y el desfasaje de hasta 60 s cruzando la medianoche ART.
  const goToday = () => onNavigate(computeArtNow().date)

  const pendingChip = hasPending ? (
    <button
      type="button"
      onClick={onToggleHighlight}
      aria-pressed={highlightPending}
      aria-label={`${pendingSummary.count} ${pendingSummary.count === 1 ? 'turno jugado' : 'turnos jugados'} sin cobrar: ${formatArs(pendingSummary.totalCents)}. Resaltar esos turnos`}
      className={cn(
        // 44px en touch (MASTER §10): dejó de ser texto y ahora se toca. En
        // escritorio baja a 36 para entrar en la barra de 60.
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-full pl-2.5 pr-3 text-sm font-semibold whitespace-nowrap transition-colors lg:h-9',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        // La receta del badge de "No cobrado" (rojo, texto 700/300 verificado
        // en AA): el chip nombra el mismo hecho que la celda y la fila de Hoy,
        // así que no puede venir en otro color. Fue ámbar del 2026-09-24 al
        // 2026-09-25 ("por cobrar, no alarma"); el dueño lo volvió a rojo.
        TONE_BADGE[PENDING_CHARGE_BADGE.tone],
        'hover:bg-destructive/15 dark:hover:bg-destructive/20',
        highlightPending && 'bg-destructive/20 ring-2 dark:bg-destructive/25',
      )}
    >
      <PendingIcon aria-hidden className="h-4 w-4 shrink-0" />
      {/* "11 sin cobrar · $ 460.000": primero cuántos turnos (lo que se busca en
          la matriz), después la plata. Sin `opacity-*`: sobre el rojo encendido
          el texto pierde contraste (axe). */}
      <span className="tabular-nums">{pendingSummary.count} sin cobrar</span>
      <span className="font-medium tabular-nums">· {formatArs(pendingSummary.totalCents)}</span>
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9"
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

  // Si el día mostrado no es hoy, en vez de la pastilla "Hoy" (que ya no cabe
  // dentro del botón porque la fecha deja de ser la de hoy) va este botón que
  // vuelve.
  const todayButton = !isToday ? (
    <button
      type="button"
      onClick={goToday}
      className="flex h-9 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring lg:h-9"
    >
      Hoy
    </button>
  ) : null

  return (
    <>
      <AdminHeaderSlot>
        <div className="hidden flex-1 items-center justify-end gap-2 lg:flex">
          {/* Centrada contra la barra superior entera (es `fixed`, así que es
              el bloque contenedor del `absolute`): así cae sobre el centro de
              la grilla de abajo. Contra el hueco del slot quedaba corrida a la
              derecha lo que mide el nombre del complejo. Debajo de `xl` va la
              fecha corta para no pisar el segmento "Grilla | Agenda". */}
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onNavigate(addDays(date, -1))}
                  aria-label="Día anterior"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Día anterior</TooltipContent>
            </Tooltip>
            <DateButton
              date={date}
              label={longWeekdayLabel(date)}
              shortLabel={dateLabel}
              todayArt={todayArt}
              isToday={isToday}
              compact={false}
              onNavigate={onNavigate}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onNavigate(addDays(date, 1))}
                  aria-label="Día siguiente"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Día siguiente</TooltipContent>
            </Tooltip>
            {todayButton}
          </div>
          {pendingChip}
          {moreMenu}
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

          <DateButton
            date={date}
            label={dateLabel}
            todayArt={todayArt}
            isToday={isToday}
            compact
            onNavigate={onNavigate}
          />

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

          {!isToday && todayButton}
        </div>

        {hasPending && <div className="mt-1 flex justify-center">{pendingChip}</div>}
      </div>
    </>
  )
}
