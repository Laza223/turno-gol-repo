import { bookingCode } from '@/lib/booking-code'
import type { RefundContactInfo } from './actions'

/** Lo que `refundContactFor` lee de una fila de la query de `/mis-reservas`. */
export type RefundContactSource = {
  id: string
  /** Día calendario ART en que arranca el turno (≠ `date` si el complejo cierra pasada la medianoche). */
  starts_on: string
  time_start: string
  deposit_amount: number
  refund_status: 'approved' | 'pending' | null
  refund_method: 'mercadopago' | 'cash' | 'transfer' | 'other' | null
  refund_processed_at: Date | string | null
  tenant_name: string
  tenant_whatsapp: string | null
  tenant_phone: string
  tenant_email: string
}

/**
 * Recordatorio de devolución de una reserva ya cancelada.
 *
 * Solo existe mientras la fila de `payments` diga que la plata no se movió. En
 * cuanto alguien la salda —el complejo tildando, o MercadoPago avisando por
 * webhook que devolvió— la tarjeta pasa a decir que está confirmada.
 */
export function refundContactFor(r: RefundContactSource): RefundContactInfo | undefined {
  if (!r.refund_status) return undefined
  return {
    amountCents: r.deposit_amount,
    state: r.refund_status === 'approved' ? 'settled' : 'pending',
    settledMethod: r.refund_status === 'approved' ? r.refund_method : null,
    settledAt:
      r.refund_status === 'approved' && r.refund_processed_at
        ? new Date(r.refund_processed_at).toISOString()
        : null,
    bookingCode: bookingCode(r.id),
    // Día físico (`starts_on`), no el operativo: con `closes_next_day` el turno de 00:00 es del día siguiente.
    dateLabel: r.starts_on.split('-').reverse().slice(0, 2).join('/'),
    timeLabel: r.time_start.slice(0, 5),
    tenantName: r.tenant_name,
    tenantWhatsapp: r.tenant_whatsapp,
    tenantPhone: r.tenant_phone,
    tenantEmail: r.tenant_email,
  }
}
