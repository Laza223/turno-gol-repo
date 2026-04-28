'use client'

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
    if (isPast) {
      return (
        <td
          className="border border-slate-100 bg-slate-50 p-1 align-top opacity-60"
          style={{ height: `${rowSpan * 56}px` }}
        >
          <span className="text-xs text-slate-400">{timeStart}</span>
        </td>
      )
    }
    return (
      <td
        className="border border-slate-100 bg-green-50 p-1 align-top cursor-pointer hover:bg-green-100 transition-colors duration-100"
        style={{ height: `${rowSpan * 56}px` }}
        onClick={onClick}
      >
        <span className="text-xs text-green-700">{timeStart}</span>
      </td>
    )
  }

  const isBlock = booking.type === 'block'
  const isPending = booking.status === 'pending_payment'
  const isCompleted = booking.status === 'completed' || booking.status === 'no_show'

  let cellClass =
    'border border-slate-100 p-1 align-top cursor-default transition-colors duration-100 '

  if (isBlock) {
    cellClass += 'bg-slate-100 text-slate-500'
  } else if (isPending) {
    cellClass += 'bg-amber-50 text-amber-800'
  } else if (isCompleted) {
    cellClass += 'bg-slate-50 text-slate-500 opacity-70'
  } else {
    cellClass += 'bg-red-50 text-red-700'
  }

  const displayName = booking.guestName
    ? booking.guestName.slice(0, 20)
    : booking.playerFirstName
      ? `${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim().slice(0, 20)
      : null

  return (
    <td
      className={cellClass}
      rowSpan={rowSpan}
      style={{ height: `${rowSpan * 56}px` }}
    >
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span className="text-xs font-medium leading-tight">
          {timeStart}–{booking.timeEnd}
        </span>
        {displayName && (
          <span className="text-xs leading-tight truncate">{displayName}</span>
        )}
        {isBlock && <span className="text-xs leading-tight text-slate-400">Bloqueo</span>}
        {isPending && (
          <span className="text-xs leading-tight text-amber-600 font-medium">Pendiente</span>
        )}
      </div>
    </td>
  )
}
