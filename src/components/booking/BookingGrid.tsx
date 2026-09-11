'use client'

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useArtNow } from '@/hooks/use-art-now'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { useDismissibleHint } from '@/hooks/use-dismissible-hint'
import { useRealtimePulse } from '@/hooks/use-realtime-pulse'
import { useGridLayout } from '@/hooks/use-grid-layout'
import { useNowLine } from '@/hooks/use-now-line'
import { useGridActions } from '@/hooks/use-grid-actions'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { GridHeaderBar } from './grid/GridHeaderBar'
import { FirstBookingHint } from './grid/FirstBookingHint'
import { GridScroller } from './grid/GridScroller'
import { GridOverlays } from './grid/GridOverlays'
import { ClosedDayEmptyState, GridOfflineBanner, NoCourtsEmptyState } from './grid/GridEmptyStates'
import { QuickFormCell } from './grid/QuickFormCell'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { moveGridFocus } from './grid/grid-keyboard-nav'
import type { RenderCanteenDialog, SlotPanelActions } from './BookingSlotPanel'
import { sumPendingCents, type GridBooking } from '@/lib/booking/grid-cells'
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
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mié',
  thu: 'Jue',
  fri: 'Vie',
  sat: 'Sáb',
  sun: 'Dom',
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
   * `settings.deposit_percentage` del complejo. El formulario rápido ya NO lo
   * usa para nada (precargar la seña online en el mostrador confundía los dos
   * mundos: ver DepositFieldset), pero sigue siendo la señal de "esta grilla
   * está montada con los settings reales del complejo". Sin esto (stories,
   * tests) el popover no se ofrece y el click de una celda libre abre el modal
   * completo, como antes.
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
   * La matriz es la misma en los dos tamaños; lo que cambia es por dónde se abre
   * el alta rápida. En escritorio es un Popover anclado a la celda tocada, que
   * es lo que deja ver la grilla alrededor. En el teléfono un popover de 280 px
   * sobre una columna de 44 no tiene dónde anclarse: va como hoja desde abajo,
   * que además es donde llega el pulgar.
   */
  const isDesktop = useIsDesktop()

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

  // El socket de Realtime tiene blips normales y auto-recuperables (carga en
  // frío, laptop que despierta, handoff de wifi) que resuelven en <1s sin que
  // el usuario pierda un solo dato — el polling de 30s del hook ya está activo
  // desde el instante 0, esté o no el banner en pantalla. Mostrar "Sin
  // conexión" ante CADA blip, por más breve que sea, alarma con algo que ya se
  // solucionó solo y contradice lo que el usuario ve ("estoy conectado"). Con
  // este delay el banner solo aparece si la caída dura más de 1.5s.
  const [showOfflineBanner, setShowOfflineBanner] = useState(false)
  useEffect(() => {
    if (status !== 'OFFLINE') return
    const t = setTimeout(() => setShowOfflineBanner(true), 1500)
    // El cleanup corre tanto al desmontar como al pasar a otro `status` — así
    // el flag vuelve a false apenas se reconecta y queda listo para debouncear
    // de nuevo si vuelve a caer.
    return () => {
      clearTimeout(t)
      setShowOfflineBanner(false)
    }
  }, [status])

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

  const courtNameById = useMemo(() => new Map(courts.map((c) => [c.id, c.name])), [courts])

  const renderQuickForm = useCallback(
    (courtId: string, courtName: string, slotTime: string) =>
      depositPercentage == null ? null : (
        <QuickFormCell
          courts={courts}
          courtId={courtId}
          courtName={courtName}
          date={date}
          slotTime={slotTime}
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

  /**
   * La celda con el alta rápida abierta, ya resuelta. La clave es
   * `courtId:HH:MM` y el id es un UUID (sin dos puntos), así que el primer `:`
   * es el separador.
   */
  const quickSlot = useMemo(() => {
    if (!quickSlotKey) return null
    const sep = quickSlotKey.indexOf(':')
    const courtId = quickSlotKey.slice(0, sep)
    const courtName = courtNameById.get(courtId)
    if (!courtName) return null
    return { courtId, courtName, slotTime: quickSlotKey.slice(sep + 1) }
  }, [quickSlotKey, courtNameById])

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
            quickSlotKey={quickSlotKey}
            onQuickClose={handleQuickClose}
            renderQuickForm={quickEnabled && isDesktop ? renderQuickForm : undefined}
          />
        </div>
      )}

      {/* Teléfono: el alta rápida entra por una hoja desde abajo. Una sola para
          toda la grilla, montada sólo cuando hay una celda abierta. */}
      {!isDesktop && quickEnabled && (
        <Sheet open={!!quickSlot} onOpenChange={(v) => !v && handleQuickClose()}>
          <SheetContent side="bottom" aria-label="Nueva reserva" className="gap-0 p-4">
            <SheetTitle className="mb-3 font-display text-base">
              {quickSlot ? `${quickSlot.courtName} · ${quickSlot.slotTime}` : 'Nueva reserva'}
            </SheetTitle>
            {quickSlot &&
              renderQuickForm(quickSlot.courtId, quickSlot.courtName, quickSlot.slotTime)}
          </SheetContent>
        </Sheet>
      )}

      <GridOverlays
        selectedSlot={selectedSlot}
        onCloseModal={() => setSelectedSlot(null)}
        onBookingSuccess={handleBookingSuccess}
        action={action}
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
      />
    </div>
  )
}
