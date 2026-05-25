'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { BookingCard } from './BookingCard'
import type { BookingStatus, BookingType, BookingRow } from '@/modules/bookings/booking.types'

const BookingFormModal = dynamic(
  () => import('./BookingFormModal').then((m) => m.BookingFormModal),
  { ssr: false },
)
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

export type GridBooking = {
  id: string
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  status: BookingStatus
  type: BookingType
  guestName: string | null
  playerFirstName: string | null
  playerLastName: string | null
  priceSnapshot: number
}

type SelectedSlot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  durationMins: 60 | 120
}

type CellState =
  | { kind: 'free' }
  | { kind: 'booking'; booking: GridBooking; rowSpan: number }
  | { kind: 'skip' }

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function generateTimeSlots(openHhmm: string, closeHhmm: string): string[] {
  const openMins = timeToMins(openHhmm)
  let closeMins = timeToMins(closeHhmm)
  if (closeMins === 0) closeMins = 24 * 60
  const slots: string[] = []
  for (let t = openMins; t < closeMins; t += 60) {
    slots.push(minsToTime(t))
  }
  return slots
}

function computeCells(
  slots: string[],
  courts: CourtRow[],
  bookings: GridBooking[],
): Map<string, CellState> {
  const cells = new Map<string, CellState>()

  for (const court of courts) {
    const coveredSlots = new Set<number>()

    for (let si = 0; si < slots.length; si++) {
      const slotTime = slots[si]!
      const key = `${court.id}:${slotTime}`

      if (coveredSlots.has(si)) {
        cells.set(key, { kind: 'skip' })
        continue
      }

      const booking = bookings.find((b) => {
        if (b.courtId !== court.id) return false
        if (b.timeStart.slice(0, 5) !== slotTime) return false
        return (
          b.status === 'confirmed' ||
          b.status === 'pending_payment' ||
          b.status === 'completed' ||
          b.status === 'no_show' ||
          b.type === 'block'
        )
      })

      if (booking) {
        const startMins = timeToMins(booking.timeStart.slice(0, 5))
        const endMins = timeToMins(booking.timeEnd.slice(0, 5))
        const durationMins = (endMins === 0 ? 24 * 60 : endMins) - startMins
        const rowSpan = Math.max(1, Math.round(durationMins / 60))
        cells.set(key, { kind: 'booking', booking, rowSpan })
        for (let j = si + 1; j < si + rowSpan; j++) {
          coveredSlots.add(j)
        }
      } else {
        cells.set(key, { kind: 'free' })
      }
    }
  }

  return cells
}

type Props = {
  courts: CourtRow[]
  initialBookings: GridBooking[]
  date: string
  tenantId: string
  openingHours: OpeningHours
  closedDates: string[]
}

export function BookingGrid({
  courts,
  initialBookings,
  date,
  tenantId,
  openingHours,
  closedDates,
}: Props) {
  const router = useRouter()
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const [artNow, setArtNow] = useState({ date: '', time: '' })

  useEffect(() => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
    setArtNow({
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
    })
  }, [])

  const { bookings, status } = useBookingRealtime({ tenantId, date, initialBookings })

  const dayIdx = new Date(`${date}T12:00:00Z`).getUTCDay()
  const dayKey = DAY_KEYS[dayIdx]!
  const dayHours = openingHours[dayKey as keyof OpeningHours]
  const closedToday = dayHours?.closed === true || closedDates.includes(date)

  const openHhmm = dayHours?.open ?? '08:00'
  const closeHhmm = dayHours?.close ?? '23:00'
  const slots = closedToday ? [] : generateTimeSlots(openHhmm, closeHhmm)

  const cells = computeCells(slots, courts, bookings)

  function isSlotPast(slotTime: string): boolean {
    if (!artNow.date) return false
    if (date < artNow.date) return true
    if (date > artNow.date) return false
    return slotTime < artNow.time
  }

  function handleSlotClick(court: CourtRow, slotTime: string) {
    setSelectedSlot({
      courtId: court.id,
      courtName: court.name,
      date,
      timeStart: slotTime,
      durationMins: 60,
    })
  }

  function handleBookingSuccess(_booking: BookingRow) {
    setSelectedSlot(null)
    // Realtime will propagate the new booking automatically
  }

  const LABEL_DAYS: Record<string, string> = {
    mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue',
    fri: 'Vie', sat: 'Sáb', sun: 'Dom',
  }

  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

  return (
    <div className="space-y-4">
      {/* Offline banner */}
      {status === 'OFFLINE' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Sin conexión. Los datos pueden no estar actualizados.
        </div>
      )}

      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Grilla</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {LABEL_DAYS[dayKey]} {dateLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/grilla?date=${addDays(date, -1)}`)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 transition-colors duration-100"
          >
            ← Anterior
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
              router.push(`/grilla?date=${today}`)
            }}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 transition-colors duration-100"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => router.push(`/grilla?date=${addDays(date, 1)}`)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 transition-colors duration-100"
          >
            Siguiente →
          </button>
        </div>
      </div>

      {courts.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-10 text-center">
          <p className="text-sm text-muted-foreground">No tenés canchas configuradas.</p>
        </div>
      )}

      {closedToday && courts.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-10 text-center">
          <p className="text-sm text-muted-foreground">Complejo cerrado este día.</p>
        </div>
      )}

      {courts.length > 0 && !closedToday && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
          <table className="border-collapse bg-white text-sm" style={{ tableLayout: 'fixed', minWidth: `${80 + courts.length * 160}px` }}>
            <colgroup>
              <col style={{ width: '80px' }} />
              {courts.map((c) => (
                <col key={c.id} style={{ width: '160px' }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs font-medium text-muted-foreground sticky left-0 z-10">
                  Hora
                </th>
                {courts.map((court) => (
                  <th
                    key={court.id}
                    className="border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-medium text-foreground"
                  >
                    {court.name}
                    {court.status === 'offline' && (
                      <span className="ml-1 text-slate-400">(offline)</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slotTime) => (
                <tr key={slotTime}>
                  <td className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-muted-foreground font-mono sticky left-0 z-10 whitespace-nowrap">
                    {slotTime}
                  </td>
                  {courts.map((court) => {
                    const key = `${court.id}:${slotTime}`
                    const cell = cells.get(key)

                    if (!cell || cell.kind === 'skip') return null

                    if (cell.kind === 'booking') {
                      return (
                        <BookingCard
                          key={court.id}
                          booking={cell.booking}
                          timeStart={slotTime}
                          isPast={isSlotPast(slotTime)}
                          rowSpan={cell.rowSpan}
                        />
                      )
                    }

                    return (
                      <BookingCard
                        key={court.id}
                        booking={null}
                        timeStart={slotTime}
                        isPast={isSlotPast(slotTime)}
                        onClick={
                          court.status === 'online' && !isSlotPast(slotTime)
                            ? () => handleSlotClick(court, slotTime)
                            : undefined
                        }
                      />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedSlot && (
        <BookingFormModal
          slot={selectedSlot}
          open={true}
          onClose={() => setSelectedSlot(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  )
}
