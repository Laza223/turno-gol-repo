import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import type {
  BookingStatus,
  BookingType,
  DepositStatus,
  PaymentMethodValue,
} from '@/modules/bookings/booking.types'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { ReservaDetail } from '../queries'

/**
 * Adapta el detalle de `/reservas/[id]` (`getBookingDetail` + el total de
 * cobros de mostrador de `getBookingCharges`) al `GridBooking` que consume el
 * control de cobro compartido con Hoy y la Grilla (`HoyChargeSection` +
 * `useSlotCharges`).
 *
 * `courtId`/`playerFirstName`/`playerLastName` quedan con un placeholder: esta
 * página no los trae (`getBookingDetail` solo trae `courtName` y `playerName`
 * ya combinado) y ninguna función de `charge-copy.ts` ni `useSlotCharges` los
 * lee — solo los usan el popover de la grilla y sus rutas, que acá no aplican.
 */
export function toGridBooking(detail: ReservaDetail, chargesTotal: number): GridBooking {
  const depositStatus = detail.depositStatus as DepositStatus
  const { totalPaid, pending } = summarizeBookingCharges({
    priceSnapshot: detail.priceSnapshot,
    depositAmount: detail.depositAmount,
    depositStatus,
    chargesTotal,
  })

  return {
    id: detail.id,
    courtId: '',
    date: detail.date,
    timeStart: detail.timeStart,
    timeEnd: detail.timeEnd,
    status: detail.status as BookingStatus,
    type: detail.type as BookingType,
    guestName: detail.guestName,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: detail.priceSnapshot,
    paymentMethod: detail.paymentMethod as PaymentMethodValue | null,
    depositStatus,
    depositAmount: detail.depositAmount,
    totalPaid,
    pending,
    startsAtMs: detail.startsAt ? new Date(detail.startsAt).getTime() : null,
    endsAtMs: detail.endsAt ? new Date(detail.endsAt).getTime() : null,
  }
}
