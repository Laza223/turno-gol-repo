'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { LayoutGrid, MoonStar } from 'lucide-react'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { BookingCard } from './BookingCard'
import { EmptyState } from '@/components/ui/empty-state'
import {
  addDays,
  buildBookingsIndex,
  computeCells,
  DAY_KEYS,
  generateTimeSlots,
} from '@/lib/booking/grid-cells'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

// Re-export GridBooking so BookingCard (and others) can import it from here.
export type { GridBooking } from '@/lib/booking/grid-cells'

const BookingFormModal = dynamic(
  () => import('./BookingFormModal').then((m) => m.BookingFormModal),
  { ssr: false },
)

type SelectedSlot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  durationMins: 60 | 120
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

  const slots = useMemo(
    () => (closedToday ? [] : generateTimeSlots(openHhmm, closeHhmm)),
    [openHhmm, closeHhmm, closedToday],
  )

  const bookingsByKey = useMemo(() => buildBookingsIndex(bookings), [bookings])

  const cells = useMemo(
    () => computeCells(slots, courts, bookingsByKey),
    [slots, courts, bookingsByKey],
  )

  const isSlotPast = useCallback(
    (slotTime: string): boolean => {
      if (!artNow.date) return false
      if (date < artNow.date) return true
      if (date > artNow.date) return false
      return slotTime < artNow.time
    },
    [artNow, date],
  )

  const handleSlotClick = useCallback(
    (court: CourtRow, slotTime: string) => {
      setSelectedSlot({
        courtId: court.id,
        courtName: court.name,
        date,
        timeStart: slotTime,
        durationMins: 60,
      })
    },
    [date],
  )

  const handleBookingSuccess = useCallback((_booking: BookingRow) => {
    setSelectedSlot(null)
    // Realtime will propagate the new booking automatically
  }, [])

  const LABEL_DAYS: Record<string, string> = {
    mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue',
    fri: 'Vie', sat: 'Sáb', sun: 'Dom',
  }

  const dateLabel = useMemo(
    () =>
      new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Argentina/Buenos_Aires',
      }),
    [date],
  )

  return (
    <div className="space-y-4">
      {/* Offline banner — kept as an amber warning div, not ErrorState, because this is a
          RECOVERABLE degraded state (realtime dropped → polling fallback). ErrorState's red
          palette implies a fatal error; that would misrepresent the severity here. */}
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
        <EmptyState
          icon={LayoutGrid}
          title="Sin canchas configuradas"
          description="Todavía no agregaste ninguna cancha. Configurá al menos una para empezar a tomar turnos."
        />
      )}

      {closedToday && courts.length > 0 && (
        <EmptyState
          icon={MoonStar}
          title="Complejo cerrado este día"
          description="Este día está marcado como cerrado en la configuración de horarios."
        />
      )}

      {courts.length > 0 && !closedToday && (
        <div className="overflow-x-auto touch-pan-x rounded-lg border border-slate-200 shadow-sm">
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
