'use client'

import React from 'react'
import {
  Ban,
  CheckCheck,
  CheckCircle2,
  Clock,
  HandCoins,
  Plus,
  Repeat,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookingPopover } from './BookingPopover'
import type { GridBooking } from './BookingGrid'

type BookingCardProps = {
  booking: GridBooking | null
  timeStart: string
  isPast: boolean
  /** Índice 0-based de la cancha (columna) y del slot horario VISIBLE (fila). */
  col: number
  row: number
  span?: number
  /** Fila de arranque de los slots en el CSS Grid: 2 sin banda de colapso, 3 con ella. */
  rowOffset?: number
  /** Densidad compacta: una sola línea (ícono + nombre), fila de 2.75rem. */
  compact?: boolean
  /** Pulso de atención (MASTER §5.3): la reserva acaba de entrar por Realtime. */
  isNew?: boolean
  courtId?: string
  courtName: string
  onSlotClick?: (courtId: string, slotTime: string) => void
  /** Popover de detalle (solo slots ocupados): estado y dónde abrirlo. */
  detailOpen?: boolean
  onDetailChange?: (bookingId: string | null) => void
  popoverSide?: 'top' | 'bottom'
  popoverAlign?: 'left' | 'right'
}

/** Posición explícita en la grilla CSS: rowOffset deja lugar a la columna de horas, la fila de headers y la banda de colapso. */
function placement(col: number, row: number, span: number, rowOffset: number): React.CSSProperties {
  return { gridColumn: col + 2, gridRow: `${row + rowOffset} / span ${span}` }
}

type SlotVisual = {
  /** Tinte de fondo de la celda (alpha del token, nunca hex nuevos). */
  cell: string
  /** Borde izquierdo de 3px: identificador primario del estado (pages/grilla.md §2). */
  borderL: string
  /** Color del label de estado — escala AA verificada (MASTER §2.4). */
  labelText: string
  icon: LucideIcon
  label: string
}

/**
 * Mapa canónico de estados (pages/grilla.md §2, MASTER §2.6):
 * el COLOR comunica el estado de la plata (semáforo §2.5), el ÍCONO + label
 * comunican qué es. El origen (abonado) ya no tiene hue propio: se reconoce
 * por Repeat + "Abonado". Prioridad: block > no_show > completed >
 * pending_payment > señada > abonado > confirmada.
 */
function slotVisual(booking: GridBooking): SlotVisual {
  if (booking.type === 'block') {
    return {
      cell: 'slot-blocked-stripes',
      borderL: 'border-l-slate-400 dark:border-l-slate-500',
      labelText: 'text-muted-foreground',
      icon: Ban,
      label: 'Bloqueado',
    }
  }
  if (booking.status === 'no_show') {
    return {
      cell: 'bg-destructive/10 dark:bg-destructive/15',
      borderL: 'border-l-destructive',
      labelText: 'text-red-700 dark:text-red-300',
      icon: UserX,
      label: 'Ausente',
    }
  }
  if (booking.status === 'completed') {
    return {
      cell: 'bg-success/15 dark:bg-success/20',
      borderL: 'border-l-success',
      labelText: 'text-emerald-800 dark:text-emerald-300',
      icon: CheckCheck,
      label: 'Jugada',
    }
  }
  if (booking.status === 'pending_payment') {
    return {
      cell: 'bg-warning/10 dark:bg-warning/15',
      borderL: 'border-l-warning',
      labelText: 'text-amber-800 dark:text-amber-300',
      icon: Clock,
      label: 'Esperando seña',
    }
  }
  if (booking.depositStatus === 'paid' || booking.depositStatus === 'captured') {
    return {
      cell: 'bg-success/10 dark:bg-success/15',
      borderL: 'border-l-success',
      labelText: 'text-emerald-800 dark:text-emerald-300',
      icon: CheckCircle2,
      label: 'Señada',
    }
  }
  if (booking.type === 'fixed') {
    return {
      cell: 'bg-info/10 dark:bg-info/15',
      borderL: 'border-l-info',
      labelText: 'text-blue-800 dark:text-blue-300',
      icon: Repeat,
      label: 'Abonado',
    }
  }
  return {
    cell: 'bg-info/10 dark:bg-info/15',
    borderL: 'border-l-info',
    labelText: 'text-blue-800 dark:text-blue-300',
    icon: HandCoins,
    label: 'Confirmada',
  }
}

export function bookingDisplayName(booking: GridBooking): string | null {
  if (booking.guestName) return booking.guestName.slice(0, 24)
  if (booking.playerFirstName) {
    return `${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim().slice(0, 24)
  }
  return null
}

function BookingCardComponent({
  booking,
  timeStart,
  isPast,
  col,
  row,
  span = 1,
  rowOffset = 2,
  compact = false,
  isNew = false,
  courtId,
  courtName,
  onSlotClick,
  detailOpen = false,
  onDetailChange,
  popoverSide = 'bottom',
  popoverAlign = 'left',
}: BookingCardProps) {
  // Hooks SIEMPRE antes del early-return de slot libre (rules-of-hooks).
  // Hover intent: delay de 300ms para evitar popovers accidentales al mover el mouse rápido.
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const bookingId = booking?.id ?? null

  const handleMouseEnter = React.useCallback(() => {
    if (!onDetailChange || !bookingId) return
    timeoutRef.current = setTimeout(() => {
      onDetailChange(bookingId)
    }, 300)
  }, [onDetailChange, bookingId])

  const handleMouseLeave = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (onDetailChange) {
      onDetailChange(null)
    }
  }, [onDetailChange])

  // Limpiar timeout si se desmonta
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!booking) {
    const interactive = !isPast && !!onSlotClick && !!courtId

    if (!interactive) {
      // Pasado: transparente, el eje ya marca la hora. Cancha pausada: gris
      // neutro no clickeable.
      return (
        <div
          aria-hidden
          style={placement(col, row, span, rowOffset)}
          className={cn('m-0.5 rounded-md', isPast ? 'bg-transparent' : 'bg-muted/40')}
        />
      )
    }

    // Libre: superficie card con borde (visible, no lavado emerald) + Plus
    // SIEMPRE visible al 40% — en touch no hay hover y la affordance no se
    // adivina (pages/grilla.md §2, desvío documentado de §2.6).
    return (
      <button
        type="button"
        style={placement(col, row, span, rowOffset)}
        data-col={col}
        data-row={row}
        onClick={() => onSlotClick?.(courtId!, timeStart)}
        aria-label={`Reservar turno ${timeStart} en ${courtName}`}
        className={cn(
          'group m-0.5 flex cursor-pointer items-center justify-center rounded-md',
          'border border-border/60 bg-card',
          'hover:border-emerald-500 hover:bg-emerald-500/5 dark:hover:border-emerald-400',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        <Plus
          aria-hidden
          className={cn(
            'h-4 w-4 text-muted-foreground/40 transition-colors duration-150',
            'group-hover:text-emerald-600 group-focus-visible:text-emerald-600',
            'dark:group-hover:text-emerald-400 dark:group-focus-visible:text-emerald-400',
          )}
        />
      </button>
    )
  }

  const visual = slotVisual(booking)
  const displayName = bookingDisplayName(booking)
  const StateIcon = visual.icon
  const popoverId = `booking-popover-${booking.id}`

  // El popover abre por hover con intent y por focus (tab o tap en mobile
  // dispara focus). Escape lo cierra sin perder el lugar en la grilla.
  // La hora NO se repite en la celda: el eje sticky es la única fuente; el
  // rango completo vive en el aria-label y en el popover.
  return (
    <div
      style={placement(col, row, span, rowOffset)}
      className="relative m-0.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        data-col={col}
        data-row={row}
        aria-label={`${courtName} ${timeStart}–${booking.timeEnd}: ${displayName ?? visual.label}, ${visual.label}`}
        aria-expanded={detailOpen}
        aria-controls={detailOpen ? popoverId : undefined}
        onFocus={onDetailChange ? () => onDetailChange(booking.id) : undefined}
        onBlur={onDetailChange ? () => onDetailChange(null) : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && detailOpen) {
            e.stopPropagation()
            onDetailChange?.(null)
          }
        }}
        className={cn(
          'flex h-full w-full cursor-default overflow-hidden rounded-md border-l-[3px] text-left',
          visual.cell,
          visual.borderL,
          isPast && 'opacity-60 saturate-50',
          isNew && 'animate-slot-pulse',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        {compact ? (
          <span className="flex min-w-0 flex-1 items-center gap-1 px-1.5">
            <StateIcon aria-hidden className={cn('h-3 w-3 shrink-0', visual.labelText)} />
            <span className="truncate text-xs font-semibold leading-tight text-foreground">
              {displayName ?? visual.label}
            </span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-1.5">
            {displayName && (
              <span className="truncate text-xs font-semibold leading-tight text-foreground">
                {displayName}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium leading-tight',
                visual.labelText,
              )}
            >
              <StateIcon aria-hidden className="h-3 w-3 shrink-0" />
              {visual.label}
            </span>
          </span>
        )}
      </button>
      {detailOpen && (
        <BookingPopover
          booking={booking}
          courtName={courtName}
          id={popoverId}
          side={popoverSide}
          align={popoverAlign}
        />
      )}
    </div>
  )
}

export const BookingCard = React.memo(BookingCardComponent)
