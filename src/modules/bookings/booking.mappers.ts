import type { bookings } from '@/shared/db/schema'
import type {
  BookingRow,
  BookingStatus,
  BookingType,
  CancellationActor,
  DepositStatus,
  PaymentMethodValue,
} from './booking.types'

type BookingDbRow = typeof bookings.$inferSelect

export function rowToBookingRow(row: BookingDbRow): BookingRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    courtId: row.courtId,
    playerId: row.playerId ?? null,
    abonadoId: row.abonadoId ?? null,
    createdByStaff: row.createdByStaff ?? null,
    date: row.date as Date,
    timeStart: row.timeStart,
    timeEnd: row.timeEnd,
    type: row.type as BookingType,
    status: row.status as BookingStatus,
    priceSnapshot: row.priceSnapshot,
    depositAmount: row.depositAmount,
    depositStatus: row.depositStatus as DepositStatus,
    paymentMethod: (row.paymentMethod as PaymentMethodValue | null) ?? null,
    paymentId: row.paymentId ?? null,
    notesInternal: row.notesInternal ?? null,
    notesPlayer: row.notesPlayer ?? null,
    guestName: row.guestName ?? null,
    guestPhone: row.guestPhone ?? null,
    canceledReason: row.canceledReason ?? null,
    canceledBy: (row.canceledBy as CancellationActor | null) ?? null,
    canceledAt: row.canceledAt ?? null,
    completedByStaff: row.completedByStaff ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
