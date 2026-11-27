'use client'

import dynamic from 'next/dynamic'
import type {
  RenderCanteenDialog,
  RenderChargeModal,
  SlotPanelActions,
} from '../slot-panel/actions'
import type { SelectedSlot } from '@/hooks/use-grid-actions'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import type {
  CheckSlotAvailabilityAction,
  CreateAbonadoAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
} from '../create-modal/types'

const BookingFormModal = dynamic(
  () => import('../BookingFormModal').then((m) => m.BookingFormModal),
  { ssr: false },
)

/**
 * Las dos superficies que se montan POR ENCIMA de la grilla: el modal de alta
 * (§3bis) y el panel de acciones del turno.
 *
 * Las dos se montan sólo cuando hay algo abierto — el `Sheet` del panel no vive
 * suscrito al DOM en la vista donde el admin pasa el día — y hay UNA sola de
 * cada una para toda la grilla, no una por celda.
 */
export function GridOverlays({
  selectedSlot,
  onCloseModal,
  onBookingSuccess,
  bookings,
  daySlots,
  isSlotPast,
  createBookingAction,
  createAbonadoAction,
  checkAvailabilityAction,
  searchPlayersAction,
  detailBooking,
  courtName,
  onCloseDetail,
  onMutated,
  hasEnded,
  courts,
  renderCanteenDialog,
  slotPanelActions,
  nowMs,
  renderChargeModal,
}: {
  selectedSlot: SelectedSlot | null
  onCloseModal: () => void
  onBookingSuccess: () => void
  bookings: GridBooking[]
  daySlots: string[]
  isSlotPast: (slotTime: string) => boolean
  createBookingAction: CreateBookingAction
  createAbonadoAction: CreateAbonadoAction
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
  detailBooking: GridBooking | null
  courtName: string
  onCloseDetail: () => void
  onMutated: () => void
  hasEnded: boolean
  courts: CourtRow[]
  renderCanteenDialog?: RenderCanteenDialog
  slotPanelActions?: SlotPanelActions
  nowMs: number
  /** El modal de cobro de Hoy (paso 3): sin esto no se ofrece detalle del turno. */
  renderChargeModal?: RenderChargeModal
}) {
  const selectedCourt = selectedSlot ? courts.find((c) => c.id === selectedSlot.courtId) : undefined

  return (
    <>
      {selectedSlot && selectedCourt && (
        <BookingFormModal
          slot={selectedSlot}
          pricing={selectedCourt.pricing}
          dayBookings={bookings}
          daySlots={daySlots}
          isSlotPast={isSlotPast}
          open={true}
          onClose={onCloseModal}
          onSuccess={onBookingSuccess}
          createBookingAction={createBookingAction}
          createAbonadoAction={createAbonadoAction}
          checkAvailabilityAction={checkAvailabilityAction}
          searchPlayersAction={searchPlayersAction}
        />
      )}

      {detailBooking &&
        renderChargeModal?.({
          booking: detailBooking,
          courtName,
          courts,
          // D2: BookingEditDialog necesita el día completo (para calcular la
          // duración máxima sin pisar otro turno) y la grilla horaria — ya
          // están acá para BookingFormModal, sólo se reenvían.
          dayBookings: bookings,
          daySlots,
          nowMs,
          // El stream de Realtime ya reemplaza los datos en vivo: acá no hay
          // un `router.refresh()` cuyo tránsito haya que bloquear.
          isRefreshing: false,
          // El "ya terminó" sale de la grilla, que es la que sabe de día
          // operativo — se pasa como red de contención para un turno sin
          // instantes físicos (ver el fallback del modal).
          hasEnded,
          actions: slotPanelActions,
          renderCanteenDialog,
          onClose: onCloseDetail,
          onMutated,
        })}
    </>
  )
}
