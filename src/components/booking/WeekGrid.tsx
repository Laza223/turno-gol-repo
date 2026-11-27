'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useArtNow } from '@/hooks/use-art-now'
import { useNowMs, useNowMsAfterHydration } from '@/hooks/use-now'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { useOfflineBannerDelay } from '@/hooks/use-offline-banner-delay'
import { useRealtimePulse } from '@/hooks/use-realtime-pulse'
import { useGridDrag } from '@/hooks/use-grid-drag'
import { BookingCard } from './BookingCard'
import { BookingMoveDialog, type MoveRequest } from './BookingMoveDialog'
import { GridOverlays } from './grid/GridOverlays'
import { GridDragGhost } from './grid/GridDragGhost'
import { ClosedDayEmptyState, GridOfflineBanner } from './grid/GridEmptyStates'
import type { RenderCanteenDialog, RenderChargeModal, SlotPanelActions } from './slot-panel/actions'
import { slotGates } from './slot-panel/slot-gates'
import {
  buildBookingsIndex,
  computeCells,
  hasBookingEnded,
  type GridBooking,
} from '@/lib/booking/grid-cells'
import { isDraggableBooking, slotRange, type DragTarget } from '@/lib/booking/grid-drag'
import { buildWeekAxis, daySlotsOf, isSlotOpenOnDay } from '@/lib/booking/week-grid'
import { slotHasPassed } from '@/shared/time/operating-day'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { SelectedSlot } from '@/hooks/use-grid-actions'
import type {
  CheckSlotAvailabilityAction,
  CreateAbonadoAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
} from './create-modal/types'

const WEEKDAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function dayParts(day: string): { weekday: string; num: string; long: string } {
  const d = new Date(`${day}T12:00:00Z`)
  return {
    weekday: WEEKDAY[d.getUTCDay()]!,
    num: String(d.getUTCDate()),
    long: d.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Argentina/Buenos_Aires',
    }),
  }
}

type Props = {
  /** La cancha de la semana. Esta vista muestra UNA cancha: siete días contra las horas. */
  court: CourtRow
  courts: CourtRow[]
  initialBookings: GridBooking[]
  /** Cualquier día de la semana a mostrar (se muestra de lunes a domingo). */
  date: string
  tenantId: string
  openingHours: OpeningHours
  closedDates: string[]
  closesNextDay: boolean
  action: CreateBookingAction
  createAbonadoAction: CreateAbonadoAction
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
  slotPanelActions?: SlotPanelActions
  renderCanteenDialog?: RenderCanteenDialog
  renderChargeModal?: RenderChargeModal
}

/**
 * Vista por semana de la Grilla: UNA cancha, siete días en columnas y las horas
 * en filas. Es la misma matriz que la vista por día con otro eje: cada columna
 * es un día (en el código el "id" de la columna es la fecha), así que el mapa
 * de celdas, las tarjetas, el alta, el panel y el arrastre son los de siempre.
 *
 * Cada día abre y cierra a su hora: las horas que un día no ofrece quedan como
 * celda apagada, igual que una cancha pausada en la vista por día.
 */
export function WeekGrid({
  court,
  courts,
  initialBookings,
  date,
  tenantId,
  openingHours,
  closedDates,
  closesNextDay,
  action,
  createAbonadoAction,
  checkAvailabilityAction,
  searchPlayersAction,
  slotPanelActions,
  renderCanteenDialog,
  renderChargeModal,
}: Props) {
  const router = useRouter()
  const artNow = useArtNow()
  const nowMs = useNowMs(30_000)
  const paintNowMs = useNowMsAfterHydration(30_000)

  const axis = useMemo(
    () => buildWeekAxis({ date, openingHours, closedDates, closesNextDay }),
    [date, openingHours, closedDates, closesNextDay],
  )
  const from = axis.days[0]!
  const to = axis.days[6]!

  const { bookings, status, refetch } = useBookingRealtime({
    tenantId,
    date: from,
    dateTo: to,
    courtId: court.id,
    initialBookings,
  })
  const showOfflineBanner = useOfflineBannerDelay(status)

  // Cada día es una "columna": su id es la fecha y `offline` marca el día cerrado.
  const dayColumns = useMemo(
    () =>
      axis.days.map((day) => ({
        id: day,
        status: axis.hours.get(day) ? ('online' as const) : ('offline' as const),
      })),
    [axis],
  )

  const cells = useMemo(() => {
    // La clave de `buildBookingsIndex` es `${courtId}:${hora}`: acá el "courtId" es el día.
    const asDayBookings = bookings.map((b) => ({ ...b, courtId: b.date }))
    return computeCells(axis.slots, dayColumns, buildBookingsIndex(asDayBookings))
  }, [bookings, axis.slots, dayColumns])

  const hasEnded = useCallback(
    (day: string, slotTime: string) => {
      const h = axis.hours.get(day)
      if (!h) return false
      return slotHasPassed({
        date: day,
        timeStart: slotTime,
        openHhmm: h.openHhmm,
        closesNextDay,
        nowDate: artNow.date,
        nowTime: artNow.time,
      })
    },
    [axis, closesNextDay, artNow],
  )

  /** La celda no se puede usar: ya pasó, o ese día no abre a esa hora. */
  const isUnavailable = useCallback(
    (slotTime: string, day: string) => {
      const row = axis.slots.indexOf(slotTime)
      return !isSlotOpenOnDay(axis, day, row) || hasEnded(day, slotTime)
    },
    [axis, hasEnded],
  )

  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null)
  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const { pulseIds, lastArrival } = useRealtimePulse(bookings, courts)

  const refreshAll = useCallback(() => {
    router.refresh()
    void refetch()
  }, [router, refetch])

  // Un handler por día, estable: las celdas libres de una columna lo comparten.
  const slotClickByDay = useMemo(() => {
    const byDay = new Map<string, (courtId: string, slotTime: string) => void>()
    for (const day of axis.days) {
      byDay.set(day, (courtId, slotTime) =>
        setSelectedSlot({ courtId, courtName: court.name, date: day, timeStart: slotTime }),
      )
    }
    return byDay
  }, [axis.days, court.name])

  const detailBooking = useMemo(() => {
    if (!detailBookingId) return null
    const found = bookings.find((b) => b.id === detailBookingId)
    if (!found || found.status.startsWith('canceled')) return null
    return found
  }, [detailBookingId, bookings])

  const canDragBooking = useCallback(
    (booking: GridBooking, slotTime: string) =>
      isDraggableBooking(booking, {
        canReschedule: slotGates({
          booking,
          hasEnded: false,
          actions: slotPanelActions,
          hasCourts: courts.length > 0,
          hasCanteen: false,
        }).canReschedule,
        started: hasEnded(booking.date, slotTime),
      }),
    [slotPanelActions, courts.length, hasEnded],
  )

  const handleDrop = useCallback(
    (booking: GridBooking, target: DragTarget) => {
      const range = slotRange(axis.slots, target.slotTime)
      if (!range) return
      const day = target.courtId
      setMoveRequest({
        booking,
        // Misma cancha: lo que cambia es el día y la hora, así que el rótulo es el día.
        fromCourtName: `${court.name} · ${dayParts(booking.date).long}`,
        toCourtId: court.id,
        toCourtName: `${court.name} · ${dayParts(day).long}`,
        date: day,
        ...range,
      })
    },
    [axis.slots, court],
  )

  const { drag, onCardPointerDown } = useGridDrag({
    scrollRef: gridScrollRef,
    courts: dayColumns,
    visibleSlots: axis.slots,
    cells,
    isSlotPast: isUnavailable,
    onDrop: handleDrop,
  })

  const listRescheduleSlots = slotPanelActions?.listRescheduleSlotsAction
  const rescheduleBooking = slotPanelActions?.rescheduleBookingAction
  const dragEnabled = Boolean(listRescheduleSlots && rescheduleBooking)

  // El alta y el panel miran "el día" del turno o del hueco elegido.
  const overlayDay = selectedSlot?.date ?? detailBooking?.date ?? from
  const overlayDaySlots = useMemo(() => daySlotsOf(axis, overlayDay), [axis, overlayDay])
  const overlayBookings = useMemo(
    () => bookings.filter((b) => b.date === overlayDay),
    [bookings, overlayDay],
  )
  const overlayIsPast = useCallback(
    (slotTime: string) => hasEnded(overlayDay, slotTime),
    [hasEnded, overlayDay],
  )

  const nothingOpen = axis.slots.length === 0
  const rowCount = axis.slots.length

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col space-y-4">
      <p aria-live="polite" role="status" className="sr-only">
        {lastArrival}
      </p>

      {showOfflineBanner && <GridOfflineBanner />}

      {nothingOpen && <ClosedDayEmptyState />}

      {!nothingOpen && (
        <div className="relative min-h-0 flex-1">
          <div
            ref={gridScrollRef}
            data-testid="week-grid"
            tabIndex={0}
            role="region"
            aria-label={`Semana de ${court.name}`}
            className={cn(
              // Sin snap mientras se arrastra: el auto-scroll de a 14 px volvía al mismo punto de encaje.
              drag ? 'snap-none' : 'snap-x snap-proximity',
              'h-full overflow-auto overscroll-x-contain rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(2,6,23,0.04),0_8px_24px_-12px_rgba(2,6,23,0.10)] dark:shadow-[0_24px_50px_-34px_rgba(0,0,0,0.9)]',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <div
              className="relative grid h-full [--tg-col:2.75rem] [--tg-hours:2.5rem] lg:[--tg-col:5rem] lg:[--tg-hours:3.5rem]"
              style={{
                gridTemplateColumns: `var(--tg-hours) repeat(7, minmax(var(--tg-col), 1fr))`,
                gridTemplateRows: `2.75rem repeat(${rowCount}, minmax(3.5rem, 1fr))`,
                minWidth: `calc(var(--tg-hours) + 7 * var(--tg-col))`,
              }}
            >
              <div
                aria-hidden
                style={{ gridColumn: 1, gridRow: 1 }}
                className="sticky left-0 top-0 z-30 border-b border-border bg-card"
              />

              {axis.days.map((day, di) => {
                const parts = dayParts(day)
                const isToday = day === artNow.date
                const closed = !axis.hours.get(day)
                return (
                  <div
                    key={day}
                    style={{ gridColumn: di + 2, gridRow: 1 }}
                    className="sticky top-0 z-20 flex min-w-0 snap-start scroll-ml-10 flex-col items-center justify-center border-b border-border bg-card/95 px-1 leading-tight backdrop-blur-sm lg:scroll-ml-14"
                  >
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-[0.03em]',
                        isToday ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {parts.weekday}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-bold tabular-nums',
                        isToday ? 'text-primary' : 'text-foreground',
                        closed && 'text-muted-foreground',
                      )}
                    >
                      {parts.num}
                    </span>
                  </div>
                )
              })}

              {axis.slots.map((slotTime, ri) => (
                <div
                  key={slotTime}
                  style={{ gridColumn: 1, gridRow: ri + 2 }}
                  className="sticky left-0 z-10 flex items-start justify-end bg-card pr-1 pt-1.5 text-xs font-medium tabular-nums text-muted-foreground lg:pr-2"
                >
                  <span className="lg:hidden">{slotTime.slice(0, 2)}</span>
                  <span className="hidden lg:inline">{slotTime}</span>
                </div>
              ))}

              {axis.days.map((day, di) =>
                axis.slots.map((slotTime, ri) => {
                  const cell = cells.get(`${day}:${slotTime}`)
                  if (!cell || cell.kind === 'skip') return null

                  if (cell.kind === 'booking') {
                    return (
                      <BookingCard
                        key={`${day}:${slotTime}`}
                        booking={cell.booking}
                        timeStart={slotTime}
                        isPast={hasEnded(day, slotTime)}
                        col={di}
                        row={ri}
                        span={cell.rowSpan}
                        isNew={pulseIds.has(cell.booking.id)}
                        ended={hasBookingEnded(cell.booking, paintNowMs)}
                        courtName={court.name}
                        detailOpen={detailBookingId === cell.booking.id}
                        onDetailChange={setDetailBookingId}
                        canDrag={dragEnabled && canDragBooking(cell.booking, slotTime)}
                        dragging={drag?.booking.id === cell.booking.id}
                        onDragPointerDown={onCardPointerDown}
                      />
                    )
                  }

                  const usable = court.status === 'online' && !isUnavailable(slotTime, day)
                  return (
                    <BookingCard
                      key={`${day}:${slotTime}`}
                      booking={null}
                      timeStart={slotTime}
                      isPast={isUnavailable(slotTime, day)}
                      col={di}
                      row={ri}
                      courtId={usable ? court.id : undefined}
                      courtName={court.name}
                      onSlotClick={usable ? slotClickByDay.get(day) : undefined}
                    />
                  )
                }),
              )}

              {drag?.target && (
                <div
                  aria-hidden
                  data-testid="drop-target"
                  data-valid={drag.target.valid}
                  style={{
                    gridColumn: drag.target.courtIndex + 2,
                    gridRow: drag.target.row + 2,
                  }}
                  className={cn(
                    'pointer-events-none relative z-10 m-[2px] rounded-md border-2',
                    drag.target.valid
                      ? 'border-primary bg-primary/10'
                      : 'border-destructive/70 bg-destructive/10',
                  )}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <GridOverlays
        selectedSlot={selectedSlot}
        onCloseModal={() => setSelectedSlot(null)}
        onBookingSuccess={() => {
          setSelectedSlot(null)
          refreshAll()
        }}
        bookings={overlayBookings}
        daySlots={overlayDaySlots}
        isSlotPast={overlayIsPast}
        createBookingAction={action}
        createAbonadoAction={createAbonadoAction}
        checkAvailabilityAction={checkAvailabilityAction}
        searchPlayersAction={searchPlayersAction}
        detailBooking={detailBooking}
        courtName={court.name}
        onCloseDetail={() => setDetailBookingId(null)}
        onMutated={refreshAll}
        hasEnded={
          detailBooking
            ? hasEnded(detailBooking.date, detailBooking.timeEnd.slice(0, 5)) ||
              (detailBooking.endsAtMs != null && detailBooking.endsAtMs <= nowMs)
            : false
        }
        courts={courts}
        renderCanteenDialog={renderCanteenDialog}
        slotPanelActions={slotPanelActions}
        nowMs={nowMs}
        renderChargeModal={renderChargeModal}
      />

      {drag && (
        <GridDragGhost
          drag={drag}
          targetLabel={
            drag.target
              ? `${dayParts(drag.target.courtId).weekday} ${dayParts(drag.target.courtId).num} · ${drag.target.slotTime}`
              : null
          }
        />
      )}

      {moveRequest && listRescheduleSlots && rescheduleBooking && (
        <BookingMoveDialog
          request={moveRequest}
          listSlotsAction={listRescheduleSlots}
          rescheduleAction={rescheduleBooking}
          onClose={() => setMoveRequest(null)}
          onSuccess={() => {
            setMoveRequest(null)
            refreshAll()
          }}
        />
      )}
    </div>
  )
}
