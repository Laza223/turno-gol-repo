'use client'

import { useCallback, useMemo, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { LayoutGrid, MoonStar, ArrowDownUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useArtNow } from '@/hooks/use-art-now'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { BookingCard } from './BookingCard'
import { WeekStrip } from './WeekStrip'
import { EmptyState } from '@/components/ui/empty-state'
import {
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

// Mismos tokens que las celdas de BookingCard (slotVisual) — si cambia uno,
// cambiar el otro.
const GRID_LEGEND = [
  { label: 'Libre', swatch: 'bg-emerald-100 dark:bg-emerald-900' },
  { label: 'Reservado', swatch: 'bg-blue-100 ring-1 ring-inset ring-blue-600 dark:bg-blue-900' },
  { label: 'Abonado', swatch: 'bg-violet-100 ring-1 ring-inset ring-violet-600 dark:bg-violet-900' },
  { label: 'Seña pendiente', swatch: 'bg-amber-100 ring-1 ring-inset ring-amber-500 dark:bg-amber-900' },
  { label: 'Bloqueado', swatch: 'bg-slate-200 ring-1 ring-inset ring-slate-400 dark:bg-slate-700' },
] as const

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
  // Reserva con popover de detalle abierto (hover/focus). Una sola a la vez.
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)
  // #29: artNow se auto-refresca cada minuto para que isSlotPast no quede
  // congelado en una grilla abierta sin recargar.
  const artNow = useArtNow()
  // Navegación entre días sin reload: la transición mantiene la grilla vieja
  // visible (atenuada) hasta que llega el server component del día nuevo.
  const [isNavPending, startNavTransition] = useTransition()

  const [isCompact, setIsCompact] = useState(false)

  const navigateToDate = useCallback(
    (d: string) => {
      startNavTransition(() => router.push(`/grilla?date=${d}`))
    },
    [router],
  )

  const { bookings, status, refetch } = useBookingRealtime({ tenantId, date, initialBookings })

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

  const nowTopRem = useMemo(() => {
    if (!artNow.date || artNow.date !== date || !openHhmm) return null
    const [nH, nM] = artNow.time.split(':').map(Number)
    const [oH, oM] = openHhmm.split(':').map(Number)
    if (nH === undefined || nM === undefined || oH === undefined || oM === undefined) return null

    const nowMins = nH * 60 + nM
    const openMins = oH * 60 + oM
    
    // Si la hora actual es antes de la apertura, o muy después, no dibujamos la línea (o se corta)
    // Asumimos cada slot de 30 mins
    if (nowMins >= openMins) {
      const diffMins = nowMins - openMins
      const rowHeightRem = isCompact ? 2.5 : 3.5
      return 2.75 + (diffMins / 30) * rowHeightRem
    }
    return null
  }, [artNow.time, artNow.date, date, openHhmm, isCompact])

  const handleSlotClick = useCallback(
    (courtId: string, slotTime: string) => {
      const court = courts.find((c) => c.id === courtId)
      if (!court) return
      setSelectedSlot({
        courtId,
        courtName: court.name,
        date,
        timeStart: slotTime,
        durationMins: 60,
      })
    },
    [courts, date],
  )

  // Navegación con flechas entre slots: cada botón lleva data-col/data-row;
  // el while salta filas cubiertas por reservas de 120 min y slots no
  // interactivos (pasados, cancha offline) hasta encontrar el siguiente foco.
  const handleGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const dCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      const dRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      if (dCol === 0 && dRow === 0) return

      const target = e.target as HTMLElement
      const col = Number(target.dataset['col'])
      const row = Number(target.dataset['row'])
      if (Number.isNaN(col) || Number.isNaN(row)) return

      e.preventDefault()
      let c = col + dCol
      let r = row + dRow
      while (c >= 0 && c < courts.length && r >= 0 && r < slots.length) {
        const next = e.currentTarget.querySelector<HTMLElement>(
          `[data-col="${c}"][data-row="${r}"]`,
        )
        if (next) {
          next.focus()
          next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          return
        }
        c += dCol
        r += dRow
      }
    },
    [courts.length, slots.length],
  )

  const handleBookingSuccess = useCallback((_booking: BookingRow) => {
    setSelectedSlot(null)
    // Refresh both: router.refresh re-runs the server component (updates the
    // initialBookings prop), and refetch hits /api/bookings to update the
    // hook's local state — the hook's useState only reads initialBookings on
    // mount, so without an explicit refetch the new booking would only appear
    // when Realtime eventually pushes it. In E2E that lag misses the
    // assertion window; in a browser tab that lost the websocket, it never
    // arrives at all.
    router.refresh()
    void refetch()
  }, [router, refetch])

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
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          Sin conexión. Los datos pueden no estar actualizados.
        </div>
      )}

      {/* Header sticky: título + tira semanal siempre a mano mientras la
          grilla scrollea. Fondo sólido para tapar el contenido que pasa
          por debajo (el admin header fijo mide 4rem). */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 space-y-3 bg-slate-50/95 px-4 py-2 backdrop-blur dark:bg-slate-950/95">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Grilla</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {LABEL_DAYS[dayKey]} {dateLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCompact(!isCompact)}
              aria-pressed={isCompact}
              aria-label="Modo compacto"
              className={cn(
                "px-3 py-1.5 min-h-11 md:min-h-9 flex items-center justify-center gap-1.5 text-sm font-medium border rounded-md transition-colors duration-150",
                isCompact 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400" 
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <ArrowDownUp aria-hidden className="h-4 w-4" />
              <span className="hidden sm:inline">{isCompact ? 'Compacto' : 'Normal'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
                navigateToDate(today)
              }}
              className="px-3 py-1.5 min-h-11 md:min-h-9 text-sm font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 transition-colors duration-150 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Hoy
            </button>
          </div>
        </div>
        <WeekStrip date={date} todayArt={artNow.date} onNavigate={navigateToDate} />
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
        <>
          <div
            data-testid="booking-grid"
            aria-busy={isNavPending}
            // tabIndex 0: un día sin slots interactivos (todos pasados) dejaría
            // la región scrolleable inalcanzable por teclado (axe
            // scrollable-region-focusable). Enfocada, scrollea con flechas.
            tabIndex={0}
            role="region"
            aria-label={`Grilla de turnos del ${LABEL_DAYS[dayKey]} ${dateLabel}`}
            className={cn(
              'overflow-auto overscroll-x-contain snap-x snap-proximity max-h-[70dvh] rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
              'transition-opacity duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
              isNavPending && 'opacity-60',
            )}
          >
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: `3.5rem repeat(${courts.length}, minmax(8.5rem, 1fr))`,
                gridTemplateRows: `2.75rem repeat(${slots.length}, ${isCompact ? '2.5rem' : '3.5rem'})`,
                minWidth: `${56 + courts.length * 136}px`,
              }}
              onKeyDown={handleGridKeyDown}
            >
              {nowTopRem !== null && (
                <div 
                  className="absolute left-[3.5rem] right-0 z-20 pointer-events-none flex items-center"
                  style={{ top: `calc(${nowTopRem}rem - 0.5px)` }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  <div className="flex-1 h-[2px] bg-red-500/70 dark:bg-red-500/50" />
                </div>
              )}
              {/* Esquina: tapa el cruce de los dos ejes sticky. */}
              <div
                aria-hidden
                style={{ gridColumn: 1, gridRow: 1 }}
                className="sticky left-0 top-0 z-30 border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900"
              />

              {/* Header sticky de canchas. */}
              {courts.map((court, ci) => (
                <div
                  key={court.id}
                  style={{ gridColumn: ci + 2, gridRow: 1 }}
                  className="sticky top-0 z-20 snap-start scroll-ml-14 flex items-center justify-center gap-1 truncate border-b border-slate-100 bg-white/95 px-2 text-xs font-semibold text-foreground backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100"
                >
                  <span className="truncate">{court.name}</span>
                  {court.status === 'offline' && (
                    <span className="shrink-0 font-normal text-slate-400">(offline)</span>
                  )}
                </div>
              ))}

              {/* Columna de horas sticky. */}
              {slots.map((slotTime, ri) => (
                <div
                  key={slotTime}
                  style={{ gridColumn: 1, gridRow: ri + 2 }}
                  className="sticky left-0 z-10 flex items-start justify-end bg-white pr-2 pt-1.5 text-[11px] font-medium tabular-nums text-slate-400 dark:bg-slate-900 dark:text-slate-500"
                >
                  {slotTime}
                </div>
              ))}

              {/* Celdas: posición explícita (col, fila, span) para que las
                  reservas de 120 min ocupen dos filas sin agujeros. */}
              {courts.map((court, ci) =>
                slots.map((slotTime, ri) => {
                  const cell = cells.get(`${court.id}:${slotTime}`)
                  if (!cell || cell.kind === 'skip') return null

                  if (cell.kind === 'booking') {
                    return (
                      <BookingCard
                        key={`${court.id}:${slotTime}`}
                        booking={cell.booking}
                        timeStart={slotTime}
                        isPast={isSlotPast(slotTime)}
                        col={ci}
                        row={ri}
                        span={cell.rowSpan}
                        courtName={court.name}
                        detailOpen={detailBookingId === cell.booking.id}
                        onDetailChange={setDetailBookingId}
                        popoverSide={ri + cell.rowSpan >= slots.length - 1 ? 'top' : 'bottom'}
                        popoverAlign={
                          courts.length > 1 && ci === courts.length - 1 ? 'right' : 'left'
                        }
                      />
                    )
                  }

                  const clickable = court.status === 'online' && !isSlotPast(slotTime)
                  return (
                    <BookingCard
                      key={`${court.id}:${slotTime}`}
                      booking={null}
                      timeStart={slotTime}
                      isPast={isSlotPast(slotTime)}
                      col={ci}
                      row={ri}
                      courtId={clickable ? court.id : undefined}
                      courtName={court.name}
                      onSlotClick={clickable ? handleSlotClick : undefined}
                    />
                  )
                }),
              )}
            </div>
          </div>

          {/* Leyenda de estados. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {GRID_LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span aria-hidden className={`inline-block h-3 w-3 rounded-sm ${item.swatch}`} />
                {item.label}
              </li>
            ))}
          </ul>
        </>
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
