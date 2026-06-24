'use client'

import React from 'react'
import { Ban, Plus, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookingPopover } from './BookingPopover'
import type { GridBooking } from './BookingGrid'

type BookingCardProps = {
  booking: GridBooking | null
  timeStart: string
  isPast: boolean
  /** Índice 0-based de la cancha (columna) y del slot horario (fila). */
  col: number
  row: number
  span?: number
  courtId?: string
  courtName: string
  onSlotClick?: (courtId: string, slotTime: string) => void
  /** Popover de detalle (solo slots ocupados): estado y dónde abrirlo. */
  detailOpen?: boolean
  onDetailChange?: (bookingId: string | null) => void
  popoverSide?: 'top' | 'bottom'
  popoverAlign?: 'left' | 'right'
}

/** Posición explícita en la grilla CSS: +2 deja lugar a la columna de horas y a la fila de headers. */
function placement(col: number, row: number, span: number): React.CSSProperties {
  return { gridColumn: col + 2, gridRow: `${row + 2} / span ${span}` }
}

type SlotVisual = {
  cell: string
  accent: string
  label: string
}

/**
 * Colores semánticos (design-system §1, patrón AA de la grilla pública):
 * texto 700/800 sobre fondo 50 (≥4.5:1) + barra de acento 500/600 como señal
 * no-cromática. Estados excepcionales (seña pendiente, no-show) pisan al tipo;
 * para confirmadas el color comunica el origen: azul = reserva, púrpura = abonado.
 */
function slotVisual(booking: GridBooking): SlotVisual {
  if (booking.type === 'block') {
    return {
      cell: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      accent: 'bg-slate-400 dark:bg-slate-500',
      label: 'Bloqueado',
    }
  }
  if (booking.status === 'pending_payment') {
    return {
      cell: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      accent: 'bg-amber-500 dark:bg-amber-400',
      label: 'Seña pendiente',
    }
  }
  if (booking.status === 'no_show') {
    return {
      cell: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
      accent: 'bg-red-500 dark:bg-red-400',
      label: 'No vino',
    }
  }
  if (booking.status === 'completed') {
    return {
      cell: 'bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400',
      accent: 'bg-slate-300 dark:bg-slate-600',
      label: 'Completada',
    }
  }
  if (booking.type === 'fixed') {
    return {
      cell: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
      accent: 'bg-violet-600 dark:bg-violet-400',
      label: 'Abonado',
    }
  }
  return {
    cell: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    accent: 'bg-blue-600 dark:bg-blue-400',
    label: 'Reservado',
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
  courtId,
  courtName,
  onSlotClick,
  detailOpen = false,
  onDetailChange,
  popoverSide = 'bottom',
  popoverAlign = 'left',
}: BookingCardProps) {
  if (!booking) {
    const interactive = !isPast && !!onSlotClick && !!courtId

    if (!interactive) {
      // Pasado: transparente, apenas la hora como referencia. Cancha offline:
      // gris neutro no clickeable.
      return (
        <div
          style={placement(col, row, span)}
          className={cn(
            'm-0.5 rounded-md flex items-start p-1.5',
            isPast ? 'bg-transparent' : 'bg-slate-50 dark:bg-slate-800/40',
          )}
        >
          <span className="text-[11px] tabular-nums text-slate-300 dark:text-slate-600">
            {timeStart}
          </span>
        </div>
      )
    }

    return (
      <button
        type="button"
        style={placement(col, row, span)}
        data-col={col}
        data-row={row}
        onClick={() => onSlotClick?.(courtId!, timeStart)}
        aria-label={`Reservar turno ${timeStart} en ${courtName}`}
        className={cn(
          'group m-0.5 rounded-md flex items-start justify-between p-1.5 cursor-pointer',
          'bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500',
        )}
      >
        <span className="text-[11px] tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
          {timeStart}
        </span>
        <Plus
          aria-hidden
          className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150"
        />
      </button>
    )
  }

  const visual = slotVisual(booking)
  const displayName = bookingDisplayName(booking)
  const isBlock = booking.type === 'block'
  const popoverId = `booking-popover-${booking.id}`

  // Hover intent: delay de 300ms para evitar popovers accidentales al mover el mouse rápido.
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = React.useCallback(() => {
    if (!onDetailChange) return
    timeoutRef.current = setTimeout(() => {
      onDetailChange(booking.id)
    }, 300)
  }, [onDetailChange, booking.id])

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

  // El popover abre por hover con intent y por
  // focus (tab o tap en mobile dispara focus). Escape lo cierra sin perder
  // el lugar en la grilla.
  return (
    <div
      style={placement(col, row, span)}
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
          'flex h-full w-full cursor-default overflow-hidden rounded-md text-left',
          visual.cell,
          isPast && 'opacity-60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500',
        )}
      >
        {/* Acento lateral: señal de estado no dependiente del color de fondo. */}
        <span aria-hidden className={cn('w-1 shrink-0 rounded-full my-1 ml-0.5', visual.accent)} />
        <span className="flex min-w-0 flex-col gap-0.5 p-1.5">
          <span className="text-[11px] font-semibold leading-tight tabular-nums">
            {timeStart}–{booking.timeEnd}
          </span>
          {displayName && (
            <span className="truncate text-xs font-medium leading-tight">{displayName}</span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] leading-tight opacity-90 mt-auto">
            {isBlock && <Ban aria-hidden className="h-3 w-3" />}
            {booking.status === 'pending_payment' && (
              <AlertCircle aria-hidden className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            )}
            {visual.label}
          </span>
        </span>
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
