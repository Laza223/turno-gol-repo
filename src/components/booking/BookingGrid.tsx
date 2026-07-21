'use client'

import { useCallback, useMemo, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { LayoutGrid, MoonStar } from 'lucide-react'
import { useArtNow } from '@/hooks/use-art-now'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { usePersistedDensity } from '@/hooks/use-persisted-density'
import { useDismissibleHint } from '@/hooks/use-dismissible-hint'
import { useRealtimePulse } from '@/hooks/use-realtime-pulse'
import { useGridLayout } from '@/hooks/use-grid-layout'
import { useNowLine } from '@/hooks/use-now-line'
import { EmptyState } from '@/components/ui/empty-state'
import { GridToolbar } from './grid/GridToolbar'
import { FirstBookingHint } from './grid/FirstBookingHint'
import { GridScroller } from './grid/GridScroller'
import { GridLegend } from './grid/GridLegend'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { CheckSlotAvailabilityAction, CreateBookingAction } from './BookingFormModal'

// Re-export GridBooking so BookingCard (and others) can import it from here.
export type { GridBooking } from '@/lib/booking/grid-cells'

const BookingFormModal = dynamic(
  () => import('./BookingFormModal').then((m) => m.BookingFormModal),
  { ssr: false },
)

const HINT_STORAGE_KEY = 'tg-hint-grilla-primera-reserva'

const LABEL_DAYS: Record<string, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue',
  fri: 'Vie', sat: 'Sáb', sun: 'Dom',
}

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
  closesNextDay: boolean
  /** Reenviada al BookingFormModal cargado por dynamic import (ver el comentario ahí). */
  action: CreateBookingAction
  /** Reenviada al BookingFormModal — opcional, ver el comentario ahí. */
  checkAvailabilityAction?: CheckSlotAvailabilityAction
}

export function BookingGrid({
  courts,
  initialBookings,
  date,
  tenantId,
  openingHours,
  closedDates,
  closesNextDay,
  action,
  checkAvailabilityAction,
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

  const { isCompact, toggleDensity } = usePersistedDensity()
  const { dismissed: hintDismissed, dismiss: dismissHint } = useDismissibleHint(HINT_STORAGE_KEY)

  const { bookings, status, refetch } = useBookingRealtime({ tenantId, date, initialBookings })

  const {
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
    setShowMorning,
  } = useGridLayout({
    openingHours,
    date,
    courts,
    bookings,
    closedDates,
    closesNextDay,
    isCompact,
    artNow,
  })

  const { pulseIds, lastArrival } = useRealtimePulse(bookings, courts)
  const { nowTopRem, gridScrollRef } = useNowLine({
    artNow,
    date,
    visibleSlots,
    hasBand,
    rowHeightRem,
  })

  const navigateToDate = useCallback(
    (d: string) => {
      startNavTransition(() => router.push(`/grilla?date=${d}`))
    },
    [router],
  )

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
  // interactivos (pasados, cancha pausada) hasta encontrar el siguiente foco.
  // Los índices son sobre las filas VISIBLES (colapso incluido).
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
      while (c >= 0 && c < courts.length && r >= 0 && r < visibleSlots.length) {
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
    [courts.length, visibleSlots.length],
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

  const dateLabel = useMemo(
    () =>
      new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Argentina/Buenos_Aires',
      }),
    [date],
  )

  const dayLabel = LABEL_DAYS[dayKey] ?? ''

  const showFirstHint =
    !hintDismissed && !closedToday && courts.length > 0 && slots.length > 0 && bookings.length === 0

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0 h-full">
      {/* Anuncio accesible de reservas nuevas por Realtime (MASTER §10). */}
      <p aria-live="polite" role="status" className="sr-only">
        {lastArrival}
      </p>

      {/* Offline banner — kept as an amber warning div, not ErrorState, because this is a
          RECOVERABLE degraded state (realtime dropped → polling fallback). ErrorState's red
          palette implies a fatal error; that would misrepresent the severity here. */}
      {status === 'OFFLINE' && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          Sin conexión. Los datos pueden no estar actualizados.
        </div>
      )}

      <GridToolbar
        date={date}
        dayLabel={dayLabel}
        dateLabel={dateLabel}
        todayArt={artNow.date}
        isCompact={isCompact}
        onToggleDensity={toggleDensity}
        onNavigate={navigateToDate}
      />

      {courts.length === 0 && (
        <EmptyState
          icon={LayoutGrid}
          title="Sin canchas configuradas"
          description="Todavía no agregaste ninguna cancha. Configurá al menos una para empezar a tomar turnos."
          action={
            // BookingGrid no recibe el rol del staff logueado (grilla/page.tsx solo
            // valida `user.type === 'staff'`, sin re-chequear admin/manager) y
            // agregar esa prop es scope creep para este cambio. Se muestra igual
            // para cualquier staff: /settings/canchas es de solo-lectura para el manager
            // (CourtList ya oculta "+ Nueva cancha" si !isAdmin), así que navegar
            // ahí nunca habilita una escritura no autorizada.
            <Link
              href="/settings/canchas"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
            >
              Configurar la primera cancha
            </Link>
          }
        />
      )}

      {closedToday && courts.length > 0 && (
        <EmptyState
          icon={MoonStar}
          title="Complejo cerrado este día"
          description="Este día está marcado como cerrado en la configuración de horarios."
          action={
            // Mismo razonamiento que arriba: sin flag de rol a mano. A diferencia
            // de /canchas, /settings/* completo es solo-admin (SettingsLayout hace
            // requireAdminStaff) — si un manager toca este link rebota a /dashboard
            // sin romper nada, así que sigue siendo inofensivo dejarlo visible.
            <Link
              href="/settings/horarios"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
            >
              Revisar horarios
            </Link>
          }
        />
      )}

      {courts.length > 0 && !closedToday && (
        <div className="flex-1 flex flex-col min-h-0 space-y-4">
          {showFirstHint && <FirstBookingHint onDismiss={dismissHint} />}

          <GridScroller
            courts={courts}
            slots={slots}
            visibleSlots={visibleSlots}
            cells={cells}
            collapsedCount={collapsedCount}
            hasBand={hasBand}
            rowOffset={rowOffset}
            rowHeightRem={rowHeightRem}
            nowTopRem={nowTopRem}
            isCompact={isCompact}
            isNavPending={isNavPending}
            gridScrollRef={gridScrollRef}
            ariaLabel={`Grilla de turnos del ${dayLabel} ${dateLabel}`}
            isSlotPast={isSlotPast}
            pulseIds={pulseIds}
            detailBookingId={detailBookingId}
            onDetailChange={setDetailBookingId}
            onSlotClick={handleSlotClick}
            onGridKeyDown={handleGridKeyDown}
            onExpandMorning={() => setShowMorning(true)}
          />

          <GridLegend />
        </div>
      )}

      {selectedSlot && (
        <BookingFormModal
          slot={selectedSlot}
          open={true}
          onClose={() => setSelectedSlot(null)}
          onSuccess={handleBookingSuccess}
          action={action}
          checkAvailabilityAction={checkAvailabilityAction}
        />
      )}
    </div>
  )
}
