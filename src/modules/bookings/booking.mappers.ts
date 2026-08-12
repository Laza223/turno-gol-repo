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

/** Fila del QUERY BUILDER de Drizzle: camelCase, fechas ya parseadas a Date. */
export function rowToBookingRow(row: BookingDbRow): BookingRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    courtId: row.courtId,
    playerId: row.playerId ?? null,
    abonadoId: row.abonadoId ?? null,
    tournamentId: row.tournamentId ?? null,
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

/**
 * B8 — la MISMA fila leída con `tx.execute` (`SELECT *` / `RETURNING *`): claves
 * snake_case y fechas como string. No es `BookingDbRow` con otro nombre: es lo
 * que Postgres manda de verdad, y confundirlos hacía que `row.tenantId`
 * compilara valiendo `undefined`. Tabla de tipos en `src/shared/db/client.ts`.
 */
export type BookingRawRow = {
  id: string
  tenant_id: string
  court_id: string
  player_id: string | null
  abonado_id: string | null
  tournament_id: string | null
  created_by_staff: string | null
  date: string
  time_start: string
  time_end: string
  type: string
  status: string
  price_snapshot: number
  deposit_amount: number
  deposit_status: string
  payment_method: string | null
  payment_id: string | null
  notes_internal: string | null
  notes_player: string | null
  guest_name: string | null
  guest_phone: string | null
  canceled_reason: string | null
  canceled_by: string | null
  canceled_at: string | null
  completed_by_staff: string | null
  created_at: string
  updated_at: string
}

export function rawRowToBookingRow(row: BookingRawRow): BookingRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    courtId: row.court_id,
    playerId: row.player_id,
    abonadoId: row.abonado_id,
    tournamentId: row.tournament_id,
    createdByStaff: row.created_by_staff,
    date: new Date(row.date),
    timeStart: row.time_start,
    timeEnd: row.time_end,
    type: row.type as BookingType,
    status: row.status as BookingStatus,
    priceSnapshot: row.price_snapshot,
    depositAmount: row.deposit_amount,
    depositStatus: row.deposit_status as DepositStatus,
    paymentMethod: row.payment_method as PaymentMethodValue | null,
    paymentId: row.payment_id,
    notesInternal: row.notes_internal,
    notesPlayer: row.notes_player,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    canceledReason: row.canceled_reason,
    canceledBy: row.canceled_by as CancellationActor | null,
    canceledAt: row.canceled_at ? new Date(row.canceled_at) : null,
    completedByStaff: row.completed_by_staff,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}
