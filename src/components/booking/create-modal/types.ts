import type { AbonadoActionResult } from '@/app/(admin)/abonados/actions'
import type { CreateBookingActionResult } from '@/app/(admin)/reservas/actions'
import type { CreateAbonadoInput } from '@/modules/abonados/abonado.types'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { CourtPricingData } from '@/modules/courts/court.types'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
import type { GridBooking } from '@/lib/booking/grid-cells'

/** Los 4 tipos del modal único (decisión 2026-09-14, pages/grilla.md §3bis). */
export type BookingKind = 'turno' | 'fijo' | 'evento' | 'bloqueo'

export type ModalSlot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
}

export type CreateBookingAction = (data: unknown) => Promise<CreateBookingActionResult>
export type CreateAbonadoAction = (input: CreateAbonadoInput) => Promise<AbonadoActionResult>

export type CheckSlotAvailabilityAction = (input: {
  courtId: string
  date: string
  timeStart: string
}) => Promise<{ available: boolean }>

export type SearchBookingPlayersResult =
  { success: true; players: PlayerSearchResult[] } | { success: false; error: string }

export type SearchBookingPlayersAction = (input: unknown) => Promise<SearchBookingPlayersResult>

/** Props que reciben los 4 forms de tipo — todo lo que necesitan de la grilla ya cargada. */
export type TypeFormProps = {
  slot: ModalSlot
  courtBookings: GridBooking[]
  daySlots: string[]
  pricing: CourtPricingData
  isSlotPast: (slotTime: string) => boolean
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
  createBookingAction: CreateBookingAction
  createAbonadoAction: CreateAbonadoAction
  onClose: () => void
  onSuccess: (booking?: BookingRow) => void
  /**
   * Emite `create_modal.confirmed` con `kind` + `durationMs` (desde que se
   * abrió el modal) ya resueltos por `BookingFormModal` — cada form sólo suma
   * lo que sabe de sí mismo (`withPlayer`/`withDeposit`). Centralizado acá
   * para no repetir el cálculo de `durationMs` en los 4 forms.
   */
  trackConfirmed: (extra?: { withPlayer?: boolean; withDeposit?: boolean }) => void
}

export type DepositMethod = 'cash' | 'transfer' | 'mercadopago' | 'other'

/** Lo que el operador afirmó sobre la plata al crear a mano. */
export type ChargeChoice = 'none' | 'partial' | 'full'
