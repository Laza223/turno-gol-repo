'use client'

import { QuickBookingForm } from '../QuickBookingForm'
import { priceForDateSlot, timeToMins } from '@/lib/booking/pricing'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import type { CourtRow } from '@/modules/courts/court.types'
import type {
  CheckSlotAvailabilityAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
} from '../BookingFormModal'

/**
 * El popover de alta rápida montado sobre una celda concreta de la grilla.
 *
 * Existe como componente y no inline en `BookingGrid` sólo para que el
 * orquestador no cargue con el armado del slot y la resolución del precio; el
 * wiring de props no cambió.
 */
export function QuickFormCell({
  courts,
  courtId,
  courtName,
  date,
  slotTime,
  depositPercentage,
  action,
  checkAvailabilityAction,
  searchPlayersAction,
  onSuccess,
  onMoreOptions,
  onClose,
}: {
  courts: CourtRow[]
  courtId: string
  courtName: string
  date: string
  slotTime: string
  depositPercentage: number
  action: CreateBookingAction
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
  onSuccess: () => void
  onMoreOptions: (courtId: string, timeStart: string) => void
  onClose: () => void
}) {
  const court = courts.find((c) => c.id === courtId)
  if (!court) return null

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
      onSuccess={onSuccess}
      onMoreOptions={(s) => onMoreOptions(s.courtId, s.timeStart)}
      onClose={onClose}
    />
  )
}
