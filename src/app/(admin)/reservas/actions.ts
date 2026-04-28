'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import {
  createManualBooking,
  completeBooking,
  markNoShow,
} from '@/modules/bookings/booking.service'
import { createManualBookingSchema } from '@/modules/bookings/booking.schema'
import {
  SlotTakenError,
  CourtOfflineError,
  PriceUnavailableError,
  BookingNotInConfirmedError,
} from '@/modules/bookings/booking.errors'
import type { BookingRow } from '@/modules/bookings/booking.types'

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

  if (result.success) revalidatePath('/reservas')
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
      const booking = await markNoShow(bookingId, staffUserId, tx)
      return { success: true as const, booking }
    } catch (err) {
      if (err instanceof BookingNotInConfirmedError) {
        return { success: false as const, error: 'La reserva no está en estado confirmado.' }
      }
      throw err
    }
  })

  if (result.success) revalidatePath('/reservas')
  return result
}
