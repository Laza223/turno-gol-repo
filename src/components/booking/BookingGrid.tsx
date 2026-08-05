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
import { QuickBookingForm } from './QuickBookingForm'
import {
  BookingSlotPanel,
  type RenderCanteenDialog,
  type SlotPanelActions,
} from './BookingSlotPanel'
import { priceForDateSlot, timeToMins } from '@/lib/booking/pricing'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type {
  CheckSlotAvailabilityAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
} from './BookingFormModal'

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
  courtStatus?: 'online' | 'offline'
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
  const router = useRouter()
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  // Celda con el popover de alta rápida abierto (Fase 3), como `courtId:HH:MM`.
  const [quickSlotKey, setQuickSlotKey] = useState<string | null>(null)
  // Reserva con el panel de acciones abierto. Una sola a la vez.
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

  // Radix devuelve el foco al elemento que lo tenía al abrir (la celda), así
  // que la navegación por flechas sigue donde estaba. Sólo hay que limpiar el
  // id.
  const handleDetailClose = useCallback(() => setDetailBookingId(null), [])

  /**
   * El panel cobró / marcó ausente: hay que refrescar los DOS lados, igual que
   * al crear una reserva (ver handleBookingSuccess).
   *
   * `router.refresh()` solo no alcanza: el hook de Realtime lee
   * `initialBookings` únicamente al montar, así que la grilla seguiría pintando
   * el estado viejo. Con la alarma de "sin cobrar" eso es peor que un refresco
   * tardío: el turno se queda en rojo DESPUÉS de haberlo cobrado, y una alarma
   * que miente entrena al staff a ignorarlas. Además los cobros viven en
   * `cash_flows`, que no emite por el canal de Realtime — nadie más va a
   * avisar.
   */
  const handleSlotMutated = useCallback(() => {
    setDetailBookingId(null)
    router.refresh()
    void refetch()
  }, [router, refetch])

  const navigateToDate = useCallback(
    (d: string) => {
      startNavTransition(() => router.push(`/grilla?date=${d}`))
    },
    [router],
  )

  /** Abre el modal completo para un slot libre (el camino de "Más opciones"). */
  const openFullModal = useCallback(
    (courtId: string, slotTime: string) => {
      const court = courts.find((c) => c.id === courtId)
      if (!court) return
      setQuickSlotKey(null)
      setSelectedSlot({
        courtId,
        courtName: court.name,
        date,
        timeStart: slotTime,
        durationMins: 60,
        courtStatus: court.status,
      })
    },
    [courts, date],
  )

  /**
   * Fase 3: el click de una celda libre abre el POPOVER de alta rápida (2
   * campos + precio ya resuelto), no el modal de 10 campos. El modal sigue a un
   * click de distancia ("Más opciones") y no perdió nada.
   *
   * Sin `depositPercentage` (stories, tests viejos) se cae al modal completo:
   * el popover no puede sugerir una seña sin saber el porcentaje del complejo.
   */
  const quickEnabled = typeof depositPercentage === 'number'

  const handleSlotClick = useCallback(
    (courtId: string, slotTime: string) => {
      if (!quickEnabled) {
        openFullModal(courtId, slotTime)
        return
      }
      setQuickSlotKey(`${courtId}:${slotTime}`)
    },
    [quickEnabled, openFullModal],
  )

  const handleQuickClose = useCallback(() => setQuickSlotKey(null), [])

  const handleBookingSuccess = useCallback((_booking: BookingRow) => {
    setSelectedSlot(null)
    setQuickSlotKey(null)
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

  const renderQuickForm = useCallback(
    (courtId: string, courtName: string, slotTime: string) => {
      const court = courts.find((c) => c.id === courtId)
      if (!court || depositPercentage == null) return null
      return (
        <QuickBookingForm
          slot={{
            courtId,
            courtName,
            date,
            timeStart: slotTime,
            timeEnd: endLabelFromMins(timeToMins(slotTime) + SLOT_DURATION_MINUTES),
          }}
          // Misma función de tarifa que usa el server: el precio se muestra al
          // instante y no puede diferir del que se graba.
          price={priceForDateSlot(court.pricing, date, slotTime)}
          action={action}
          checkAvailabilityAction={checkAvailabilityAction}
          searchPlayersAction={searchPlayersAction}
          depositPercentage={depositPercentage}
          onSuccess={handleBookingSuccess}
          onMoreOptions={(s) => openFullModal(s.courtId, s.timeStart)}
          onClose={handleQuickClose}
        />
      )
    },
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
        actions={actions}
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
            quickSlotKey={quickSlotKey}
            onQuickClose={handleQuickClose}
            renderQuickForm={quickEnabled ? renderQuickForm : undefined}
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
          searchPlayersAction={searchPlayersAction}
        />
      )}

      {/* Panel de acciones del turno: UNO para toda la grilla, no uno por celda.
          Se monta sólo cuando hay un turno abierto — así el Sheet no vive
          suscrito al DOM en la vista donde el admin pasa el día. */}
      {detailBooking && (
        <BookingSlotPanel
          booking={detailBooking}
          courtName={courtNameById.get(detailBooking.courtId) ?? 'Cancha'}
          onClose={handleDetailClose}
          onMutated={handleSlotMutated}
          // El "ya terminó" sale de la grilla, que es la que sabe de día
          // operativo; el panel no lo recalcula (ver su prop hasEnded).
          hasEnded={isSlotPast(detailBooking.timeEnd)}
          courts={courts}
          renderCanteenDialog={renderCanteenDialog}
          actions={slotPanelActions}
        />
      )}
    </div>
  )
}
