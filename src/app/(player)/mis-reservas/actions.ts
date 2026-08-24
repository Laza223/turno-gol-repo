'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { bookingCode } from '@/lib/booking-code'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, boundedText } from '@/shared/validation/primitives'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { enforce } from '@/shared/rate-limit'
import { withPlayerContext, withTenantContext } from '@/shared/db/client'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { cancelByPlayer, type CancellationOutcome } from '@/modules/bookings/booking.cancellation'
import {
  BookingAlreadyEndedError,
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  TenantInactiveError,
} from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { captureMessage } from '@/lib/sentry'

const cancelSchema = z.object({
  bookingId: uuid,
  reason: boundedText(500).optional(),
})

/**
 * Auditoría #08-mis-reservas-data-leak: BookingRow completo trae
 * notesInternal/createdByStaff/completedByStaff/paymentId/guestName/guestPhone
 * — datos internos del staff. Next.js serializa TODO el valor de retorno de
 * una Server Action en el payload RSC (visible en el Network tab del
 * jugador), sin importar si el componente cliente los lee. Este tipo
 * reducido es lo único que el jugador puede ver de SU PROPIA reserva.
 */
type PlayerBookingRow = Pick<
  BookingRow,
  | 'id'
  | 'status'
  | 'date'
  | 'timeStart'
  | 'timeEnd'
  | 'depositStatus'
  | 'depositAmount'
  | 'priceSnapshot'
  | 'canceledReason'
  | 'canceledAt'
>

function toPlayerBookingRow(booking: BookingRow): PlayerBookingRow {
  return {
    id: booking.id,
    status: booking.status,
    date: booking.date,
    timeStart: booking.timeStart,
    timeEnd: booking.timeEnd,
    depositStatus: booking.depositStatus,
    depositAmount: booking.depositAmount,
    priceSnapshot: booking.priceSnapshot,
    canceledReason: booking.canceledReason,
    canceledAt: booking.canceledAt,
  }
}

/**
 * Lo que el jugador necesita para reclamar la devolución de su seña.
 *
 * Va en el resultado de la cancelación —y no en una query aparte— porque es
 * justo el momento en que hace falta: hasta ahora el jugador cancelaba, veía la
 * tarjeta cambiar de color y no se le decía ni cuánto le tenían que devolver ni
 * a quién escribirle. Los mensajes de error del propio archivo dicen "contactá
 * al complejo" sin dar ningún canal.
 *
 * Solo contacto PÚBLICO del complejo: el mismo que ya se publica en /[slug].
 */
export type RefundContactInfo = {
  /** Centavos. Es la seña entera: no existen devoluciones parciales. */
  amountCents: number
  /**
   * `settled` = la plata ya volvió. `pending` = la devolución la tiene que
   * hacer el complejo.
   */
  state: 'settled' | 'pending'
  /**
   * Por dónde volvió la plata. **Solo tiene sentido con `state: 'settled'`.**
   *
   * Existe porque sin esto la pantalla decía "MercadoPago ya procesó la
   * devolución" para CUALQUIER devolución saldada — incluida la que el complejo
   * marcó como entregada en efectivo o por transferencia. El jugador se
   * quedaba esperando en MercadoPago una plata que ya tenía en la mano, que es
   * la misma clase de mentira que este circuito vino a sacar del producto.
   */
  settledMethod: 'mercadopago' | 'cash' | 'transfer' | 'other' | null
  /** Cuándo se saldó, ISO. `null` en las devoluciones viejas sin `processed_at`. */
  settledAt: string | null
  bookingCode: string
  /** "DD/MM" y "HH:MM" del turno, para que el mensaje identifique cuál era. */
  dateLabel: string
  timeLabel: string
  tenantName: string
  tenantWhatsapp: string | null
  tenantPhone: string
  tenantEmail: string
}

export type PlayerBookingActionResult =
  | { success: true; booking: PlayerBookingRow; refund?: RefundContactInfo }
  | { success: false; error: string }

async function requirePlayer() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')
  return user
}

export async function cancelMyBookingAction(
  bookingId: string,
  reason?: string,
): Promise<PlayerBookingActionResult> {
  const parsed = cancelSchema.safeParse({ bookingId, reason })
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const user = await requirePlayer()

  const rl = await enforce('playerBooking', user.playerId)
  if (!rl.ok) return { success: false, error: 'Demasiadas solicitudes. Esperá un momento.' }

  // B2 audit fix: pre-read with withPlayerContext so RLS player_own_bookings_select
  // filters to ONLY bookings owned by this player, even if the connection role bypasses RLS.
  // Defense in depth: avoids leaking tenant_id/deposit_status of arbitrary bookings.
  const pre = await withPlayerContext(user.playerId, async (tx) => {
    // El JOIN a `tenants` trae el contacto público del complejo en la misma ida
    // a la base: es lo que después se le ofrece al jugador para reclamar la
    // devolución. `tenants` es tabla global sin RLS y estas cuatro columnas ya
    // se publican en /[slug], así que no expone nada nuevo.
    const rows = await tx.execute(sql`
      SELECT b.tenant_id, b.deposit_status, b.deposit_amount,
             t.name AS tenant_name, t.phone AS tenant_phone,
             t.whatsapp AS tenant_whatsapp, t.email AS tenant_email
      FROM bookings b
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${parsed.data.bookingId}
      LIMIT 1
    `)
    return (
      rows as unknown as Array<{
        tenant_id: string
        deposit_status: string
        deposit_amount: number
        tenant_name: string
        tenant_phone: string
        tenant_whatsapp: string | null
        tenant_email: string
      }>
    )[0]
  })
  if (!pre) return { success: false, error: 'Reserva no encontrada.' }

  // Regla de la clase (rediseño Caja/Cantina): el catch va FUERA del contexto
  // transaccional — atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw. Acá cancelByPlayer tira antes de escribir, pero el patrón
  // uniforme evita que un refactor futuro herede la mina.
  let outcome: CancellationOutcome
  try {
    outcome = await withTenantContext(pre.tenant_id, (tx) =>
      cancelByPlayer(parsed.data.bookingId, user.playerId, parsed.data.reason, tx),
    )
  } catch (err) {
    if (err instanceof BookingNotOwnedByPlayerError) {
      return { success: false, error: 'No tenés permiso para cancelar esta reserva.' }
    }
    if (err instanceof BookingNotInConfirmedError) {
      return { success: false, error: 'La reserva no está en estado confirmado.' }
    }
    // 07-cancelbyplayer-noshow-guard: el turno ya terminó — no es una
    // cancelación, es una ausencia; se resuelve con el complejo.
    if (err instanceof BookingAlreadyEndedError) {
      return { success: false, error: 'El turno ya terminó. Contactá al complejo.' }
    }
    // #31: el complejo en estado blocked/deleted hace que cancelByPlayer lance
    // TenantInactiveError. Sin este catch se propagaba como error no controlado
    // de la Server Action, dejando el dialog colgado sin feedback inline.
    if (err instanceof TenantInactiveError) {
      return { success: false, error: 'El complejo no está disponible para cancelar online.' }
    }
    throw err
  }

  revalidatePath('/mis-reservas')

  // doc7 Flujo 4: booking_canceled encolado dentro de la tx (cancelByPlayer)
  // se despacha recién ahora que commiteó. Si el dispatch falla, la cancelación
  // ya es válida —no hay rollback— y el sweep por cron de send-email levanta la
  // notificación 'queued' igual; nunca convertir esto en error para el usuario.
  try {
    await Promise.all(outcome.notificationIds.map((id) => dispatchEmail(id)))
  } catch (err) {
    captureMessage('email dispatch failed after player cancellation', {
      level: 'warning',
      extra: {
        bookingId: parsed.data.bookingId,
        tenantId: pre.tenant_id,
        notificationIds: outcome.notificationIds,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }

  const booking = toPlayerBookingRow(outcome.booking)

  // `canceled_refunded` es exactamente "corresponde devolver la seña": lo fija
  // `cancelByPlayer` solo cuando la cancelación entró en política Y había seña
  // pagada. Fuera de política el turno queda `canceled_no_refund` y acá no se
  // promete nada — el contacto del complejo igual se ofrece en la pantalla,
  // pero bajo otro texto.
  const refund: RefundContactInfo | undefined =
    booking.status === 'canceled_refunded'
      ? {
          amountCents: pre.deposit_amount,
          // Siempre 'pending', y no es un valor por defecto perezoso: en el
          // instante de cancelar NUNCA hay una devolución hecha. La plata la
          // devuelve el complejo después, por el medio que elija, y recién ahí
          // `page.tsx` lee el estado real de la fila de `payments`. Hubo una
          // versión de esto que podía nacer 'settled' porque el reembolso
          // automático de MercadoPago resolvía dentro de esta misma request;
          // ese camino se eliminó (devolvía 403 siempre).
          state: 'pending',
          settledMethod: null,
          settledAt: null,
          bookingCode: bookingCode(parsed.data.bookingId),
          dateLabel: booking.date
            .toISOString()
            .slice(0, 10)
            .split('-')
            .reverse()
            .slice(0, 2)
            .join('/'),
          timeLabel: booking.timeStart.slice(0, 5),
          tenantName: pre.tenant_name,
          tenantWhatsapp: pre.tenant_whatsapp,
          tenantPhone: pre.tenant_phone,
          tenantEmail: pre.tenant_email,
        }
      : undefined

  return { success: true, booking, ...(refund ? { refund } : {}) }
}
