'use client'

import { cn } from '@/lib/utils'
import type { GridBooking } from './BookingGrid'

type Props = {
  booking: GridBooking | null
  timeStart: string
  isPast: boolean
  rowSpan?: number
  onClick?: () => void
}

export function BookingCard({ booking, timeStart, isPast, rowSpan = 1, onClick }: Props) {
  if (!booking) {
    const interactive = !isPast && !!onClick
    return (
      <td
        {...(interactive
          ? {
              role: 'button',
              tabIndex: 0,
              onClick,
              onKeyDown: (e: React.KeyboardEvent<HTMLTableCellElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick?.()
                }
              },
              'aria-label': `Reservar turno ${timeStart}`,
            }
          : {})}
        className={cn(
          'border border-slate-100 p-1 align-top transition-colors duration-100',
          isPast
            ? 'bg-slate-50 opacity-60'
            : interactive
              ? 'cursor-pointer bg-white hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500'
              : 'bg-slate-50',
        )}
        style={{ height: `${rowSpan * 56}px` }}
      >
        <span className="text-xs text-slate-400">{timeStart}</span>
      </td>
    )
  }

  const isBlock = booking.type === 'block'
  const isPending = booking.status === 'pending_payment'
  const isNoShow = booking.status === 'no_show'
  const isCompleted = booking.status === 'completed'

  // Semantic status colors (design-system §1): green = confirmed, amber = pending,
  // red = no-show, slate = block/completed. A left border accent doubles the cue
  // so status isn't conveyed by fill color alone (a11y: color-not-only).
  let cellClass =
    'border border-slate-100 border-l-2 p-1 align-top cursor-default transition-colors duration-100 '
  let statusLabel: string | null = null

  if (isBlock) {
    cellClass += 'border-l-slate-400 bg-slate-100 text-slate-600'
    statusLabel = 'Bloqueo'
  } else if (isPending) {
    cellClass += 'border-l-amber-500 bg-amber-50 text-amber-800'
    statusLabel = 'Pendiente'
  } else if (isNoShow) {
    cellClass += 'border-l-red-500 bg-red-50 text-red-700 opacity-90'
    statusLabel = 'No vino'
  } else if (isCompleted) {
    cellClass += 'border-l-slate-300 bg-slate-50 text-slate-500 opacity-80'
    statusLabel = 'Completada'
  } else {
    // confirmed
    cellClass += 'border-l-green-600 bg-green-50 text-green-800'
  }

  const displayName = booking.guestName
    ? booking.guestName.slice(0, 20)
    : booking.playerFirstName
      ? `${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim().slice(0, 20)
      : null

  return (
    <td className={cellClass} rowSpan={rowSpan} style={{ height: `${rowSpan * 56}px` }}>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span className="text-xs font-medium leading-tight tabular-nums">
          {timeStart}–{booking.timeEnd}
        </span>
        {displayName && (
          <span className="truncate text-xs leading-tight">{displayName}</span>
        )}
        {statusLabel && (
          <span className="text-xs font-medium leading-tight">{statusLabel}</span>
        )}
      </div>
    </td>
  )
}
