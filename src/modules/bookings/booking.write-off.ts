import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { BookingValidationError } from './booking.errors'
import { depositCashFlowDescription, summarizeBookingCharges } from './booking.charges'
import { completeBooking } from './booking.service'

/**
 * "Dar por perdido" (decisión 2026-11-07, `docs/decisions/2026-11-07-cobrar-varios-y-dar-por-perdido.md`):
 * el staff resigna lo que falta cobrar de un turno jugado. Una fila en
 * `booking_write_offs` con el monto guardado; el saldo sigue siendo derivado
 * (`summarizeBookingCharges` resta lo perdido).
 *
 * Los errores son `BookingValidationError` y se TIRAN (no se devuelven): si el
 * turno se completó en esta misma tx, un return commitearía la completación a
 * medias. La Server Action los atrapa afuera de `withTenantContext`.
 */

/** Mensaje de las acciones de cobro cuando el turno ya está dado por perdido. */
export const WRITTEN_OFF_CHARGE_ERROR = 'Este turno está dado por perdido.'

type LockedBooking = {
  status: string
  type: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  endedAlready: boolean
}

export async function writeOffBooking(
  tenantId: string,
  staffUserId: string,
  bookingId: string,
  expectedPendingCents: number,
  tx: DbTx,
): Promise<{ amount: number }> {
  const locked = await tx.execute(sql`
    SELECT status, type, price_snapshot AS "priceSnapshot", deposit_amount AS "depositAmount",
           deposit_status AS "depositStatus", ends_at <= NOW() AS "endedAlready"
    FROM bookings
    WHERE id = ${bookingId} AND tenant_id = ${tenantId}
    FOR UPDATE
  `)
  const booking = (locked as unknown as LockedBooking[])[0]
  if (!booking) throw new BookingValidationError('No se encontró la reserva.')
  if (booking.type === 'block' || booking.type === 'tournament') {
    throw new BookingValidationError('Un bloqueo o una hora de torneo no se da por perdida.')
  }

  if (booking.status === 'confirmed') {
    if (!booking.endedAlready) {
      throw new BookingValidationError('El turno todavía no terminó.')
    }
    // Mismo camino que "terminar y cobrar": el turno ya jugado pasa a completed en esta tx.
    await completeBooking(bookingId, 'admin', tx, staffUserId)
  } else if (booking.status !== 'completed') {
    throw new BookingValidationError('Este turno no se puede dar por perdido.')
  }

  // Releer TODO bajo el lock: el saldo que vio el staff pudo moverse.
  const charged = await tx.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS "chargesTotal"
    FROM cash_flows
    WHERE tenant_id = ${tenantId} AND booking_id = ${bookingId}
      AND type = 'income' AND category = 'booking'
      AND description <> ${depositCashFlowDescription(bookingId)}
  `)
  const chargesTotal = (charged as unknown as Array<{ chargesTotal: number }>)[0]?.chargesTotal ?? 0
  const existingRows = await tx.execute(sql`
    SELECT amount FROM booking_write_offs WHERE booking_id = ${bookingId} AND tenant_id = ${tenantId}
  `)
  const existing = (existingRows as unknown as Array<{ amount: number }>)[0]?.amount ?? 0

  // Reintento del mismo pedido (doble clic, respuesta perdida): éxito sin escribir.
  if (existing > 0) {
    if (existing === expectedPendingCents) return { amount: existing }
    throw new BookingValidationError('Este turno ya está dado por perdido.')
  }

  const { pending } = summarizeBookingCharges({
    priceSnapshot: booking.priceSnapshot,
    depositAmount: booking.depositAmount,
    depositStatus: booking.depositStatus,
    chargesTotal,
    writtenOff: 0,
  })
  if (pending <= 0) throw new BookingValidationError('Este turno no tiene saldo pendiente.')
  if (pending !== expectedPendingCents) {
    throw new BookingValidationError('El saldo cambió, revisá antes de darlo por perdido.')
  }

  const inserted = await tx.execute(sql`
    INSERT INTO booking_write_offs (tenant_id, booking_id, amount, written_off_by)
    VALUES (${tenantId}, ${bookingId}, ${pending}, ${staffUserId})
    ON CONFLICT (booking_id) DO NOTHING
    RETURNING id
  `)
  if ([...inserted].length > 0) {
    await insertAuditLog(tx, {
      tenantId,
      actorId: staffUserId,
      actorType: 'staff',
      action: 'booking.written_off',
      resourceType: 'booking',
      resourceId: bookingId,
      metadata: { amountCents: pending },
    })
  }
  return { amount: pending }
}

/** Deshace un perdido. Idempotente: sin fila no hace nada. */
/** Minutos para deshacer un "Dar por perdido" (el aviso dura mucho menos). */
const UNDO_WRITE_OFF_WINDOW_MINUTES = 15

export async function undoWriteOffBooking(
  tenantId: string,
  staffUserId: string,
  bookingId: string,
  tx: DbTx,
): Promise<void> {
  // Mismo orden de locks que los cobros: primero la fila del turno.
  await tx.execute(
    sql`SELECT id FROM bookings WHERE id = ${bookingId} AND tenant_id = ${tenantId} FOR UPDATE`,
  )
  // Deshacer es para un clic equivocado, desde el aviso (decisión del dueño,
  // 2026-11-07). El servidor lo hace cumplir: pasada la ventana, el perdido
  // queda. Sin esto, deshacer un turno de más de 24 h lo dejaría a merced de la
  // acreditación automática, que lo daría por cobrado en efectivo.
  const deleted = await tx.execute(sql`
    DELETE FROM booking_write_offs
    WHERE booking_id = ${bookingId} AND tenant_id = ${tenantId}
      AND created_at > NOW() - make_interval(mins => ${UNDO_WRITE_OFF_WINDOW_MINUTES})
    RETURNING amount
  `)
  const row = (deleted as unknown as Array<{ amount: number }>)[0]
  if (!row) {
    const still = await tx.execute(
      sql`SELECT 1 FROM booking_write_offs WHERE booking_id = ${bookingId} AND tenant_id = ${tenantId}`,
    )
    if ((still as unknown as unknown[]).length > 0) {
      throw new BookingValidationError('Ya no se puede deshacer: pasó el momento.')
    }
    return
  }
  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking.write_off_undone',
    resourceType: 'booking',
    resourceId: bookingId,
    metadata: { amountCents: row.amount },
  })
}
