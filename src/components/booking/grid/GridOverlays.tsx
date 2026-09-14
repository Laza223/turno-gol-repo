'use client'

import dynamic from 'next/dynamic'
import {
  BookingSlotPanel,
  type RenderCanteenDialog,
  type SlotPanelActions,
} from '../BookingSlotPanel'
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

      {detailBooking && (
        <BookingSlotPanel
          booking={detailBooking}
          courtName={courtName}
          onClose={onCloseDetail}
          onMutated={onMutated}
          // El "ya terminó" sale de la grilla, que es la que sabe de día
          // operativo; el panel no lo recalcula (ver su prop hasEnded).
          hasEnded={hasEnded}
          courts={courts}
          renderCanteenDialog={renderCanteenDialog}
          actions={slotPanelActions}
        />
      )}
    </>
  )
}
