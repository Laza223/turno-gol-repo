'use client'

import { useCallback, useMemo, type KeyboardEvent } from 'react'
import { useArtNow } from '@/hooks/use-art-now'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { usePersistedDensity } from '@/hooks/use-persisted-density'
import { useDismissibleHint } from '@/hooks/use-dismissible-hint'
import { useRealtimePulse } from '@/hooks/use-realtime-pulse'
import { useGridLayout } from '@/hooks/use-grid-layout'
import { useNowLine } from '@/hooks/use-now-line'
import { useGridActions } from '@/hooks/use-grid-actions'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { GridToolbar } from './grid/GridToolbar'
import { FirstBookingHint } from './grid/FirstBookingHint'
import { GridScroller } from './grid/GridScroller'
import { GridDayList } from './grid/GridDayList'
import { GridLegend } from './grid/GridLegend'
import { GridOverlays } from './grid/GridOverlays'
import {
  ClosedDayEmptyState,
  GridOfflineBanner,
  NoCourtsEmptyState,
} from './grid/GridEmptyStates'
import { QuickFormCell } from './grid/QuickFormCell'
import { moveGridFocus } from './grid/grid-keyboard-nav'
import type { RenderCanteenDialog, SlotPanelActions } from './BookingSlotPanel'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type {
  CheckSlotAvailabilityAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
} from './BookingFormModal'

// Re-export GridBooking so BookingCard (and others) can import it from here.
export type { GridBooking } from '@/lib/booking/grid-cells'

const HINT_STORAGE_KEY = 'tg-hint-grilla-primera-reserva'

const LABEL_DAYS: Record<string, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue',
  fri: 'Vie', sat: 'Sáb', sun: 'Dom',
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
  /** Reenviada al BookingFormModal — opcional, ver el comentario ahí. */
  searchPlayersAction?: SearchBookingPlayersAction
  /**
   * `settings.deposit_percentage` del complejo: el popover de alta rápida
   * sugiere la seña con ese porcentaje. Sin esto (stories/tests) el popover no
   * se ofrece y el click de una celda libre abre el modal completo, como antes.
   */
  depositPercentage?: number
  /**
   * Acciones del panel lateral del turno (Fase 3). Opcional: sin ellas el panel
   * abre igual y muestra el detalle, sólo que sin botones — es el modo en el
   * que corren las stories, que no pueden importar Server Actions.
   */
  slotPanelActions?: SlotPanelActions
  /** Se reenvía tal cual al panel del turno — ver `RenderCanteenDialog`. */
  renderCanteenDialog?: RenderCanteenDialog
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
  checkAvailabilityAction,
  searchPlayersAction,
  depositPercentage,
  slotPanelActions,
  renderCanteenDialog,
  actions,
}: Props) {
  // #29: artNow se auto-refresca cada minuto para que isSlotPast no quede
  // congelado en una grilla abierta sin recargar.
  const artNow = useArtNow()

  /**
   * Matriz (escritorio) o lista con swipe entre canchas (mobile). Se monta UNA
   * sola: no son dos layouts del mismo árbol sino dos vistas, y las celdas
   * libres portalizan un Popover al body — con las dos montadas, un tap en la
   * lista abriría también el popover de la matriz "oculta". Ver `useIsDesktop`.
   */
  const isDesktop = useIsDesktop()

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

  const {
    quickEnabled,
    selectedSlot,
    setSelectedSlot,
    quickSlotKey,
    detailBookingId,
    setDetailBookingId,
    isNavPending,
    closeDetail: handleDetailClose,
    closeQuick: handleQuickClose,
    handleSlotMutated,
    navigateToDate,
    openFullModal,
    handleSlotClick,
    handleBookingSuccess,
  } = useGridActions({ courts, date, depositPercentage, refetch })

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
  const detailBooking = useMemo(
    () => (detailBookingId ? (bookings.find((b) => b.id === detailBookingId) ?? null) : null),
    [detailBookingId, bookings],
  )

  const courtNameById = useMemo(
    () => new Map(courts.map((c) => [c.id, c.name])),
    [courts],
  )

  const renderQuickForm = useCallback(
    (courtId: string, courtName: string, slotTime: string) =>
      depositPercentage == null ? null : (
        <QuickFormCell
          courts={courts}
          courtId={courtId}
          courtName={courtName}
          date={date}
          slotTime={slotTime}
          depositPercentage={depositPercentage}
          action={action}
          checkAvailabilityAction={checkAvailabilityAction}
          searchPlayersAction={searchPlayersAction}
          onSuccess={handleBookingSuccess}
          onMoreOptions={openFullModal}
          onClose={handleQuickClose}
        />
      ),
    [
      courts,
      date,
      depositPercentage,
      action,
      checkAvailabilityAction,
      searchPlayersAction,
      openFullModal,
      handleQuickClose,
      handleBookingSuccess,
    ],
  )

  const handleGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) =>
      moveGridFocus(e, { cols: courts.length, rows: visibleSlots.length }),
    [courts.length, visibleSlots.length],
  )

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

      {status === 'OFFLINE' && <GridOfflineBanner />}

      <GridToolbar
        date={date}
        dayLabel={dayLabel}
        dateLabel={dateLabel}
        todayArt={artNow.date}
        isCompact={isCompact}
        onToggleDensity={toggleDensity}
        onNavigate={navigateToDate}
        actions={actions}
      />

      {courts.length === 0 && <NoCourtsEmptyState />}

      {closedToday && courts.length > 0 && <ClosedDayEmptyState />}

      {courts.length > 0 && !closedToday && (
        <div className="flex-1 flex flex-col min-h-0 space-y-4">
          {showFirstHint && <FirstBookingHint onDismiss={dismissHint} />}

          {/* El envoltorio con clases responsive NO es redundante con el
              ternario. El ternario decide QUÉ se monta (una sola vista, para
              que no haya dos popovers portalizados al body); las clases
              deciden qué se VE en el primer paint. React resincroniza
              `useSyncExternalStore` en un efecto PASIVO, o sea después de
              pintar: sin esto, un teléfono que carga /grilla en frío pinta un
              frame de la matriz de 600px — justo el layout que esta fase
              existe para eliminar — y recién después la reemplaza por la
              lista. Con `hidden lg:flex` ese frame no se ve. */}
          {isDesktop ? (
            <div className="hidden min-h-0 flex-1 flex-col gap-4 lg:flex">
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
                quickSlotKey={quickSlotKey}
                onQuickClose={handleQuickClose}
                renderQuickForm={quickEnabled ? renderQuickForm : undefined}
              />
              {/* La leyenda explica el color de la matriz. En la lista cada
                  fila ya trae el label escrito al lado del ícono: ahí sobra. */}
              <GridLegend />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:hidden">
              <GridDayList
                courts={courts}
                slots={slots}
                visibleSlots={visibleSlots}
                cells={cells}
                collapsedCount={collapsedCount}
                hasBand={hasBand}
                isSlotPast={isSlotPast}
                pulseIds={pulseIds}
                onDetailChange={setDetailBookingId}
                onSlotClick={handleSlotClick}
                onExpandMorning={() => setShowMorning(true)}
                isNavPending={isNavPending}
                quickSlotKey={quickSlotKey}
                onQuickClose={handleQuickClose}
                renderQuickForm={quickEnabled ? renderQuickForm : undefined}
              />
            </div>
          )}
        </div>
      )}

      <GridOverlays
        selectedSlot={selectedSlot}
        onCloseModal={() => setSelectedSlot(null)}
        onBookingSuccess={handleBookingSuccess}
        action={action}
        checkAvailabilityAction={checkAvailabilityAction}
        searchPlayersAction={searchPlayersAction}
        detailBooking={detailBooking}
        courtName={detailBooking ? (courtNameById.get(detailBooking.courtId) ?? 'Cancha') : 'Cancha'}
        onCloseDetail={handleDetailClose}
        onMutated={handleSlotMutated}
        hasEnded={detailBooking ? isSlotPast(detailBooking.timeEnd) : false}
        courts={courts}
        renderCanteenDialog={renderCanteenDialog}
        slotPanelActions={slotPanelActions}
      />
    </div>
  )
}
