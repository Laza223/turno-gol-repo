'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { uuid, boundedText } from '@/shared/validation/primitives'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withTenantContext, getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import {
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
} from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

const cancelSchema = z.object({
  bookingId: uuid,
  reason: boundedText(500).optional(),
})

export type PlayerBookingActionResult =
  | { success: true; booking: BookingRow }
  | { success: false; error: string }

async function requirePlayer() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/login')
  return user
}

export async function cancelMyBookingAction(
  bookingId: string,
  reason?: string,
): Promise<PlayerBookingActionResult> {
  const parsed = cancelSchema.safeParse({ bookingId, reason })
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  const user = await requirePlayer()
  const db = getDb()

  // Pre-read to get tenantId + depositStatus.
  const preRows = await db.execute(sql`
    SELECT tenant_id, deposit_status
    FROM bookings
    WHERE id = ${parsed.data.bookingId}
    LIMIT 1
  `)
  const pre = (preRows as unknown as Array<{ tenant_id: string; deposit_status: string }>)[0]
  if (!pre) return { success: false, error: 'Reserva no encontrada.' }

  let gateway: PaymentGateway | null = null
  if (pre.deposit_status === 'paid') {
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

  const result = await withTenantContext(pre.tenant_id, async (tx) => {
    try {
      const booking = await cancelByPlayer(parsed.data.bookingId, user.playerId, parsed.data.reason, gateway, tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotOwnedByPlayerError) {
        return { success: false as const, error: 'No tenés permiso para cancelar esta reserva.' }
      }
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/mis-reservas')
  return result
}
