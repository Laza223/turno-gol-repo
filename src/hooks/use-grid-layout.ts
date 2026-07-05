'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  buildBookingsIndex,
  computeCells,
  countCollapsibleLeading,
  DAY_KEYS,
  generateTimeSlots,
} from '@/lib/booking/grid-cells'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { ArtNow } from '@/hooks/use-art-now'

export type GridCells = ReturnType<typeof computeCells>

type Params = {
  openingHours: OpeningHours
  date: string
  courts: CourtRow[]
  bookings: GridBooking[]
  closedDates: string[]
  closesNextDay: boolean
  isCompact: boolean
  artNow: ArtNow
}

export type GridLayout = {
  dayKey: string
  closedToday: boolean
  slots: string[]
  cells: GridCells
  isSlotPast: (slotTime: string) => boolean
  collapsedCount: number
  visibleSlots: string[]
  hasBand: boolean
  rowOffset: number
  rowHeightRem: number
  showMorning: boolean
  setShowMorning: (v: boolean) => void
}

/**
 * Modelo derivado de la grilla del día: horarios operativos → slots → celdas,
 * más el colapso de la madrugada muerta (pages/grilla.md §5) y el predicado
 * `isSlotPast` (día operativo: la madrugada con closesNextDay ocurre mañana).
 * Concentra toda la matemática de layout que antes vivía inline en BookingGrid.
 */
export function useGridLayout({
  openingHours,
  date,
  courts,
  bookings,
  closedDates,
  closesNextDay,
  isCompact,
  artNow,
}: Params): GridLayout {
  // Banda de madrugada colapsada expandida manualmente (por visita al día; el
  // componente se remonta con key={date}, así que resetea al cambiar de día).
  const [showMorning, setShowMorning] = useState(false)

  const dayIdx = new Date(`${date}T12:00:00Z`).getUTCDay()
  const dayKey = DAY_KEYS[dayIdx]!
  const dayHours = openingHours[dayKey as keyof OpeningHours]
  const closedToday = dayHours?.closed === true || closedDates.includes(date)

  const openHhmm = dayHours?.open ?? '08:00'
  const closeHhmm = dayHours?.close ?? '23:00'

  const slots = useMemo(
    () => (closedToday ? [] : generateTimeSlots(openHhmm, closeHhmm, closesNextDay)),
    [openHhmm, closeHhmm, closedToday, closesNextDay],
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
      // Día operativo: un slot de madrugada (slotTime < apertura, con
      // closesNextDay) ocurre FÍSICAMENTE mañana, así que en el día operativo de
      // hoy todavía es futuro aunque su hora de pared sea menor que "ahora".
      if (closesNextDay && slotTime < openHhmm) return false
      return slotTime < artNow.time
    },
    [artNow, date, closesNextDay, openHhmm],
  )

  // Madrugada muerta colapsada (pages/grilla.md §5): las horas ya pasadas sin
  // ninguna reserva se pliegan a una banda de 2rem en vez de forzar scroll.
  const collapsedCount = useMemo(
    () => (showMorning ? 0 : countCollapsibleLeading(slots, courts, cells, isSlotPast)),
    [showMorning, slots, courts, cells, isSlotPast],
  )
  const visibleSlots = useMemo(
    () => (collapsedCount > 0 ? slots.slice(collapsedCount) : slots),
    [slots, collapsedCount],
  )
  const hasBand = collapsedCount > 0
  const rowOffset = hasBand ? 3 : 2
  const rowHeightRem = isCompact ? 2.75 : 3.25

  return {
    dayKey,
    closedToday,
    slots,
    cells,
    isSlotPast,
    collapsedCount,
    visibleSlots,
    hasBand,
    rowOffset,
    rowHeightRem,
    showMorning,
    setShowMorning,
  }
}
