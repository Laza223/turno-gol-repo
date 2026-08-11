'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, boundedText } from '@/shared/validation/primitives'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { enforce } from '@/shared/rate-limit'
import { withPlayerContext, withTenantContext, getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { settleRefund } from '@/modules/payments/payment.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { cancelByPlayer, type CancellationOutcome } from '@/modules/bookings/booking.cancellation'
import {
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  RefundUnavailableError,
  TenantInactiveError,
} from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import { captureMessage } from '@/lib/sentry'

const cancelSchema = z.object({
  bookingId: uuid,
  reason: boundedText(500).optional(),
})

export type PlayerBookingActionResult =
  { success: true; booking: BookingRow } | { success: false; error: string }

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
    const rows = await tx.execute(sql`
      SELECT tenant_id, deposit_status
      FROM bookings
      WHERE id = ${parsed.data.bookingId}
      LIMIT 1
    `)
    return (rows as unknown as Array<{ tenant_id: string; deposit_status: string }>)[0]
  })
  if (!pre) return { success: false, error: 'Reserva no encontrada.' }

  let gateway: PaymentGateway | null = null
  if (pre.deposit_status === 'paid') {
    const db = getDb()
    const tenantRows = await db
      .select({ mpAccessToken: tenants.mpAccessToken })
      .from(tenants)
      .where(eq(tenants.id, pre.tenant_id))
      .limit(1)
    const mpAccessToken = tenantRows[0]?.mpAccessToken
    if (mpAccessToken) {
      gateway = resolveTenantGateway(pre.tenant_id, mpAccessToken)
    }
  }

  // Regla de la clase (rediseño Caja/Cantina): el catch va FUERA del contexto
  // transaccional — atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw. Acá cancelByPlayer tira antes de escribir, pero el patrón
  // uniforme evita que un refactor futuro herede la mina.
  let outcome: CancellationOutcome
  try {
    outcome = await withTenantContext(pre.tenant_id, (tx) =>
      cancelByPlayer(parsed.data.bookingId, user.playerId, parsed.data.reason, gateway, tx),
    )
  } catch (err) {
    if (err instanceof BookingNotOwnedByPlayerError) {
      return { success: false, error: 'No tenés permiso para cancelar esta reserva.' }
    }
    if (err instanceof BookingNotInConfirmedError) {
      return { success: false, error: 'La reserva no está en estado confirmado.' }
    }
    // #31: el complejo en estado blocked/deleted hace que cancelByPlayer lance
    // TenantInactiveError. Sin este catch se propagaba como error no controlado
    // de la Server Action, dejando el dialog colgado sin feedback inline.
    if (err instanceof TenantInactiveError) {
      return { success: false, error: 'El complejo no está disponible para cancelar online.' }
    }
    // Hallazgo 2: seña MP pero gateway no disponible (token delinkeado). No se
    // puede procesar el reembolso automático; el jugador debe gestionarlo con el complejo.
    if (err instanceof RefundUnavailableError) {
      return {
        success: false,
        error: 'No se pudo procesar el reembolso automático. Contactá al complejo.',
      }
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

  // caza-bugs #3: el refund a MP se resuelve DESPUÉS de que la cancelación ya
  // commiteó (prepareRefund solo dejó la fila 'pending' durable dentro de la
  // tx). Si esta llamada falla, la cancelación del jugador ya es válida —no
  // hay rollback— pero el refund queda pendiente de resolución manual/retry.
  if (outcome.pendingRefund && gateway) {
    try {
      await settleRefund(outcome.pendingRefund, gateway, pre.tenant_id)
    } catch (err) {
      captureMessage('mp refund settlement failed after player cancellation', {
        level: 'error',
        extra: {
          bookingId: parsed.data.bookingId,
          tenantId: pre.tenant_id,
          refundPaymentId: outcome.pendingRefund.refundPaymentId,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  return { success: true, booking: outcome.booking }
}
