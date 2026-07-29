'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { BookingFormModal, type CreateBookingAction, type CheckSlotAvailabilityAction } from './BookingFormModal'
import type { BookingRow } from '@/modules/bookings/booking.types'

type CourtOption = {
  id: string
  name: string
}

export function QuickBookingButton({
  courts,
  createBookingAction,
  checkSlotAvailabilityAction,
  defaultDate,
}: {
  courts: CourtOption[]
  createBookingAction: CreateBookingAction
  checkSlotAvailabilityAction?: CheckSlotAvailabilityAction
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
  }

  function handleSuccess(_booking: BookingRow) {
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 md:min-h-9"
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
        />
      )}
    </>
  )
}
