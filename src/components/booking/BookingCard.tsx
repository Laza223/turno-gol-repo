'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { gridSlotVisual } from '@/lib/booking/slot-visual'
import { holdExpiresAtIso, holdRemainingLabel } from '@/lib/booking/hold'
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
  /** Panel lateral de detalle+acciones (solo slots ocupados): lo controla BookingGrid, uno a la vez. */
  detailOpen?: boolean
  onDetailChange?: (bookingId: string | null) => void
  /**
   * Alta rápida (Fase 3): si el caller devuelve contenido, la celda libre se
   * envuelve en un Popover anclado a ella misma y el click lo abre en vez de
   * ir directo al modal. Sin esto la celda se comporta como antes.
   */
  quickOpen?: boolean
  renderQuickForm?: () => React.ReactNode
  onQuickClose?: () => void
}

/** Posición explícita en la grilla CSS: rowOffset deja lugar a la columna de horas, la fila de headers y la banda de colapso. */
function placement(col: number, row: number, span: number, rowOffset: number): React.CSSProperties {
  return { gridColumn: col + 2, gridRow: `${row + rowOffset} / span ${span}` }
}

/**
 * El mapa canónico de estados vive en `@/lib/booking/slot-visual` desde Fase 3
 * — compartido con la leyenda de la grilla y con el listado de /reservas, que
 * antes tenían cada uno su copia a mano (y ya habían divergido en los tintes).
 *
 * La regla de lectura no cambió (pages/grilla.md §2, MASTER §2.6): el COLOR
 * comunica el estado de la plata, el ÍCONO + label comunican qué es.
 */

/**
 * Cuánto le queda al hold, en la celda de la grilla del staff (B15 / decisión
 * v2 D1: "marca «pagando ahora» en la grilla del staff").
 *
 * Es un componente propio, y no un valor calculado arriba, para que el
 * `setInterval` exista SOLO mientras hay un hold en pantalla: la grilla de un
 * sábado tiene decenas de celdas y ninguna otra necesita tickear.
 *
 * Sin esto el encargado leía "Esperando seña" sin saber si faltaban 10
 * segundos o si el jugador ya había abandonado — o sea, si atender el teléfono
 * del que llama por esa cancha o hacerlo esperar.
 */
function HoldCountdown({ createdAt }: { createdAt: string | Date }) {
  const heldUntil = holdExpiresAtIso(createdAt)
  const [nowMs, setNowMs] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const remaining = holdRemainingLabel(heldUntil, nowMs)
  // Vencido por reloj: la fila sigue reteniendo la cancha hasta que la barre el
  // worker, así que no se dice "libre".
  return <span className="tabular-nums">{remaining.expired ? 'liberando…' : remaining.label}</span>
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
  quickOpen = false,
  renderQuickForm,
  onQuickClose,
}: BookingCardProps) {
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
    const freeButton = (
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
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          quickOpen && 'border-emerald-500 bg-emerald-500/5',
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

    if (!renderQuickForm) return freeButton

    // El Popover se ancla a la celda: el admin ve el formulario donde tocó, sin
    // perder de vista la grilla. `Root` sin contenido montado cuesta un contexto
    // por celda; el `Content` sólo se portaliza cuando está abierto.
    return (
      <Popover open={quickOpen} onOpenChange={(v) => !v && onQuickClose?.()}>
        <PopoverTrigger asChild>{freeButton}</PopoverTrigger>
        <PopoverContent
          align="start"
          side="right"
          sideOffset={6}
          collisionPadding={12}
          className="w-auto p-3"
        >
          {renderQuickForm()}
        </PopoverContent>
      </Popover>
    )
  }

  const visual = gridSlotVisual(booking)
  const displayName = bookingDisplayName(booking)
  const StateIcon = visual.icon

  // Click/tap/Enter abre el panel lateral (Fase 3) con el detalle Y las
  // acciones. Antes esto abría un popover de sólo-lectura por hover: se sacó
  // porque hover no existe en touch (el mostrador usa tablet) y porque mirar
  // sin poder cobrar obligaba a irse a /reservas con alguien esperando.
  // El panel lo renderiza BookingGrid, uno solo para toda la grilla.
  //
  // La hora NO se repite en la celda: el eje sticky es la única fuente; el
  // rango completo vive en el aria-label y en el panel.
  return (
    <button
      type="button"
      style={placement(col, row, span, rowOffset)}
      data-col={col}
      data-row={row}
      onClick={() => onDetailChange?.(booking.id)}
      aria-haspopup="dialog"
      aria-expanded={detailOpen}
      aria-label={`${courtName} ${timeStart}–${booking.timeEnd}: ${displayName ? `${displayName}, ${visual.label}` : visual.label}`}
      className={cn(
        'm-0.5 flex cursor-pointer overflow-hidden rounded-md border-l-[3px] text-left',
        visual.cell,
        visual.borderL,
        // La alarma NO se atenúa con isPast: un turno sin cobrar es pasado por
        // definición, y apagarlo sería apagar justo lo que pide atención.
        isPast && !visual.alarm && 'opacity-90 saturate-50',
        visual.alarm && 'slot-alarm-ring',
        isNew && 'animate-slot-pulse',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
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
            {booking.status === 'pending_payment' && booking.createdAt && (
              <HoldCountdown createdAt={booking.createdAt} />
            )}
          </span>
        </span>
      )}
    </button>
  )
}

export const BookingCard = React.memo(BookingCardComponent)
