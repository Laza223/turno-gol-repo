'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext, getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import {
  createManualBooking,
  completeBooking,
} from '@/modules/bookings/booking.service'
import {
  cancelByAdmin,
  handleNoShow,
} from '@/modules/bookings/booking.cancellation'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { createManualBookingSchema } from '@/modules/bookings/booking.schema'
import {
  SlotTakenError,
  CourtOfflineError,
  PriceUnavailableError,
  BookingNotInConfirmedError,
} from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

export type BookingActionResult =
  | { success: true; booking: BookingRow }
  | { success: false; error: string }

async function requireStaffTenant() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  return { user, tenant }
}

export async function createBookingAction(
  data: unknown,
): Promise<BookingActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const parsed = createManualBookingSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const staffUserId = user.staffUserId!

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await createManualBooking(
        tenant.id,
        { ...parsed.data, staffUserId },
        tx,
      )
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof SlotTakenError) {
        return { success: false as const, error: 'Este turno acaba de ser tomado.' }
      }
      if (err instanceof CourtOfflineError) {
        return { success: false as const, error: 'La cancha no está disponible.' }
      }
      if (err instanceof PriceUnavailableError) {
        return { success: false as const, error: 'No hay precio configurado para este horario.' }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/reservas')
  return result
}

// NOTE: detail/action mutations also need to revalidate `/reservas/[id]`.
// revalidatePath('/reservas') alone only invalidates the list page — the
// dynamic detail route keeps its cached server data and router.refresh()
// re-renders the same stale booking. Use a helper to invalidate BOTH.
function revalidateBooking(bookingId: string): void {
  revalidatePath('/reservas')
  revalidatePath(`/reservas/${bookingId}`)
}

export async function completeBookingAction(
  bookingId: string,
): Promise<BookingActionResult> {
  const { tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await completeBooking(bookingId, 'admin', tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      throw err
    }
  })

  if (result.success) revalidateBooking(bookingId)
  return result
}

export async function markNoShowAction(
  bookingId: string,
): Promise<BookingActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const staffUserId = user.staffUserId ?? ''

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await handleNoShow(bookingId, staffUserId, tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      throw err
    }
  })

  if (result.success) revalidateBooking(bookingId)
  return result
}

export async function cancelBookingAction(
  bookingId: string,
  reason: string,
  shouldRefund: boolean,
): Promise<BookingActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }

  const staffUserId = user.staffUserId ?? ''

  let gateway: PaymentGateway | null = null
  if (shouldRefund) {
    const db = getDb()
    const rows = await db
      .select({ mpAccessToken: tenants.mpAccessToken })
      .from(tenants)
      .where(eq(tenants.id, tenant.id))
      .limit(1)
    const mpAccessToken = rows[0]?.mpAccessToken
    if (mpAccessToken) {
      gateway = resolveTenantGateway(tenant.id, mpAccessToken)
    }
  }

  const result = await withTenantContext(tenant.id, async (tx) => {
    try {
      const booking = await cancelByAdmin(bookingId, staffUserId, reason, shouldRefund, gateway, tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      throw err
    }
  })

  if (result.success) revalidateBooking(bookingId)
  return result
}
