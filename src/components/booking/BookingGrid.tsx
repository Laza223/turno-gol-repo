'use client'

import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import { useArtNow } from '@/hooks/use-art-now'
import { useNowMs } from '@/hooks/use-now'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { useDismissibleHint } from '@/hooks/use-dismissible-hint'
import { useOfflineBannerDelay } from '@/hooks/use-offline-banner-delay'
import { useRealtimePulse } from '@/hooks/use-realtime-pulse'
import { useGridLayout } from '@/hooks/use-grid-layout'
import { useNowLine } from '@/hooks/use-now-line'
import { useGridActions } from '@/hooks/use-grid-actions'
import { GridHeaderBar } from './grid/GridHeaderBar'
import { FirstBookingHint } from './grid/FirstBookingHint'
import { GridScroller } from './grid/GridScroller'
import { GridOverlays } from './grid/GridOverlays'
import { ClosedDayEmptyState, GridOfflineBanner, NoCourtsEmptyState } from './grid/GridEmptyStates'
import { moveGridFocus } from './grid/grid-keyboard-nav'
import type { RenderCanteenDialog, RenderChargeModal, SlotPanelActions } from './slot-panel/actions'
import { sumPendingCents, type GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type {
  CheckSlotAvailabilityAction,
  CreateAbonadoAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
} from './create-modal/types'

// Re-export GridBooking so BookingCard (and others) can import it from here.
export type { GridBooking } from '@/lib/booking/grid-cells'

const HINT_STORAGE_KEY = 'tg-hint-grilla-primera-reserva'

const LABEL_DAYS: Record<string, string> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mié',
  thu: 'Jue',
  fri: 'Vie',
  sat: 'Sáb',
  sun: 'Dom',
}

/** "Lun 24 de septiembre": el título del día que ve la Grilla y su aria-label. */
function gridDateHeading(date: string, dayKey: string): { dateLabel: string; dayLabel: string } {
  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  return { dateLabel, dayLabel: LABEL_DAYS[dayKey] ?? '' }
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
  /** Reenviada al BookingFormModal (Turno fijo → `createAbonadoAction`). */
  createAbonadoAction: CreateAbonadoAction
  /** Reenviada al BookingFormModal — opcional, ver el comentario ahí. */
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  /** Reenviada al BookingFormModal — opcional, ver el comentario ahí. */
  searchPlayersAction?: SearchBookingPlayersAction
  /**
   * Acciones del panel lateral del turno (Fase 3). Opcional: sin ellas el panel
   * abre igual y muestra el detalle, sólo que sin botones — es el modo en el
   * que corren las stories, que no pueden importar Server Actions.
   */
  slotPanelActions?: SlotPanelActions
  /** Se reenvía tal cual al panel del turno — ver `RenderCanteenDialog`. */
  renderCanteenDialog?: RenderCanteenDialog
  /** El modal de cobro de Hoy (paso 3) — ver `RenderChargeModal`. Sin esto, tocar un turno no abre nada. */
  renderChargeModal?: RenderChargeModal
  actions?: React.ReactNode
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
  createAbonadoAction,
  checkAvailabilityAction,
  searchPlayersAction,
  slotPanelActions,
  renderCanteenDialog,
  renderChargeModal,
  actions,
}: Props) {
  // #29: artNow se auto-refresca cada minuto para que isSlotPast no quede
  // congelado en una grilla abierta sin recargar.
  const artNow = useArtNow()
  // Reloj del modal de cobro (paso 3, docs/decisions/
  // 2026-09-24-navegacion-panel.md): 30s alcanza para "Terminó hace N min".
  const nowMs = useNowMs(30_000)

  const { dismissed: hintDismissed, dismiss: dismissHint } = useDismissibleHint(HINT_STORAGE_KEY)

  const { bookings, status, refetch } = useBookingRealtime({ tenantId, date, initialBookings })

  // Del lado del cliente, sobre `bookings` (no `initialBookings`): calcularlo en
  // el server dejaría el número congelado y contradiciendo la grilla apenas
  // entra un cobro por Realtime. Cero queries nuevas — `pending` ya viaja en
  // cada `GridBooking` (ver grilla/page.tsx y /api/bookings).
  const pendingSummary = useMemo(() => sumPendingCents(bookings), [bookings])

  // El chip "Por cobrar hoy" dejó de ser texto muerto: encenderlo le pone anillo
  // a los turnos que deben plata, que en una matriz de 7 canchas por 14 horas ya
  // no se encuentran solo por el color.
  const [highlightPending, setHighlightPending] = useState(false)

  const showOfflineBanner = useOfflineBannerDelay(status)

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
    artNow,
  })

  const {
    selectedSlot,
    setSelectedSlot,
    detailBookingId,
    setDetailBookingId,
    isNavPending,
    closeDetail: handleDetailClose,
    handleSlotMutated,
    navigateToDate,
    handleSlotClick,
    handleBookingSuccess,
  } = useGridActions({ courts, date, refetch })

  const { pulseIds, lastArrival } = useRealtimePulse(bookings, courts)
  const { nowTopRem, gridScrollRef } = useNowLine({
    artNow,
    date,
    visibleSlots,
    hasBand,
    rowHeightRem,
  })

  // El panel se alimenta de `bookings` (la lista viva), no de un snapshot al
  // abrir: si entra un cobro por Realtime mientras el panel está abierto, el
  // saldo que muestra se actualiza solo en vez de quedar mintiendo.
  //
  // El modal queda abierto entre cobros, así que se cierra solo cuando el turno
  // deja de estar activo en este día: la carga inicial trae solo estados
  // activos, pero Realtime y `/api/bookings` también traen los cancelados y
  // los que se reprogramaron a otro día. Un bloqueo liberado se borra.
  const detailBooking = useMemo(() => {
    if (!detailBookingId) return null
    const found = bookings.find((b) => b.id === detailBookingId)
    if (!found || found.date !== date || found.status.startsWith('canceled')) return null
    return found
  }, [detailBookingId, bookings, date])

  const courtNameById = useMemo(() => new Map(courts.map((c) => [c.id, c.name])), [courts])

  const handleGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) =>
      moveGridFocus(e, { cols: courts.length, rows: visibleSlots.length }),
    [courts.length, visibleSlots.length],
  )

  const { dateLabel, dayLabel } = useMemo(() => gridDateHeading(date, dayKey), [date, dayKey])

  const showFirstHint =
    !hintDismissed && !closedToday && courts.length > 0 && slots.length > 0 && bookings.length === 0

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0 h-full">
      {/* Anuncio accesible de reservas nuevas por Realtime (MASTER §10). */}
      <p aria-live="polite" role="status" className="sr-only">
        {lastArrival}
      </p>

      {showOfflineBanner && <GridOfflineBanner />}

      <GridHeaderBar
        date={date}
        dateLabel={`${dayLabel} ${dateLabel}`}
        todayArt={artNow.date}
        onNavigate={navigateToDate}
        pendingSummary={pendingSummary}
        highlightPending={highlightPending}
        onToggleHighlight={() => setHighlightPending((v) => !v)}
      />

      {actions}

      {courts.length === 0 && <NoCourtsEmptyState />}

      {closedToday && courts.length > 0 && <ClosedDayEmptyState />}

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
            isNavPending={isNavPending}
            highlightPending={highlightPending}
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
        </div>
      )}

      <GridOverlays
        selectedSlot={selectedSlot}
        onCloseModal={() => setSelectedSlot(null)}
        onBookingSuccess={handleBookingSuccess}
        bookings={bookings}
        daySlots={slots}
        isSlotPast={isSlotPast}
        createBookingAction={action}
        createAbonadoAction={createAbonadoAction}
        checkAvailabilityAction={checkAvailabilityAction}
        searchPlayersAction={searchPlayersAction}
        detailBooking={detailBooking}
        courtName={
          detailBooking ? (courtNameById.get(detailBooking.courtId) ?? 'Cancha') : 'Cancha'
        }
        onCloseDetail={handleDetailClose}
        onMutated={handleSlotMutated}
        hasEnded={detailBooking ? isSlotPast(detailBooking.timeEnd) : false}
        courts={courts}
        renderCanteenDialog={renderCanteenDialog}
        slotPanelActions={slotPanelActions}
        nowMs={nowMs}
        renderChargeModal={renderChargeModal}
      />
    </div>
  )
}
