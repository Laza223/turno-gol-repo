import { and, count, eq, isNull } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { bookings, courts } from '@/shared/db/schema'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export interface ChecklistState {
  accountCreated: boolean
  complexData: boolean
  hasCourts: boolean
  hasSchedule: boolean
  mpConnected: boolean
  publicLinkShared: boolean
  firstBookingReceived: boolean
}

export async function getChecklistState(
  tenantId: string,
  settings: TenantSettings,
  mpConnected: boolean,
): Promise<ChecklistState> {
  return withTenantContext(tenantId, async (tx) => {
    const [courtsCount, firstBooking] = await Promise.all([
      tx
        .select({ value: count() })
        .from(courts)
        .where(eq(courts.tenantId, tenantId))
        .then((r) => Number(r[0]?.value ?? 0)),

      tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            isNull(bookings.createdByStaff),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null),
    ])

    return {
      accountCreated: true,
      complexData: true,
      hasCourts: courtsCount > 0,
      hasSchedule: true,
      mpConnected,
      publicLinkShared: settings.public_link_shared === true,
      firstBookingReceived: firstBooking !== null,
    }
  })
}
