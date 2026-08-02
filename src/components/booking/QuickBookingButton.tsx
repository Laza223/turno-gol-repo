'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import {
  BookingFormModal,
  type CreateBookingAction,
  type CheckSlotAvailabilityAction,
  type SearchBookingPlayersAction,
} from './BookingFormModal'
import type { BookingRow } from '@/modules/bookings/booking.types'

type CourtOption = {
  id: string
  name: string
  status: 'online' | 'offline'
}

export function QuickBookingButton({
  courts,
  createBookingAction,
  checkSlotAvailabilityAction,
  searchPlayersAction,
  defaultDate,
}: {
  courts: CourtOption[]
  createBookingAction: CreateBookingAction
  checkSlotAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
  defaultDate?: string
}) {
  const [open, setOpen] = useState(false)

  if (courts.length === 0) return null

  const todayArt = defaultDate ?? new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const defaultCourt = courts[0]!

  const initialSlot = {
    courtId: defaultCourt.id,
    courtName: defaultCourt.name,
    date: todayArt,
    timeStart: '20:00',
    durationMins: 60 as const,
    courtStatus: defaultCourt.status,
  }

  function handleSuccess(_booking: BookingRow) {
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9"
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        Reserva rápida
      </button>

      {open && (
        <BookingFormModal
          open={open}
          slot={initialSlot}
          onClose={() => setOpen(false)}
          onSuccess={handleSuccess}
          action={createBookingAction}
          checkAvailabilityAction={checkSlotAvailabilityAction}
          searchPlayersAction={searchPlayersAction}
        />
      )}
    </>
  )
}
