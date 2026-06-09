import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { abonados, bookings, courts } from '@/shared/db/schema'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export interface DashboardMetrics {
  bookingsToday: number
  revenueTodayCents: number
  activeAbonados: number
}

export interface ChecklistState {
  accountCreated: boolean
  complexData: boolean
  hasCourts: boolean
  hasSchedule: boolean
  mpConnected: boolean
  publicLinkShared: boolean
  firstBookingReceived: boolean
}

function todayInArgentina(): Date {
  const str = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  return new Date(str)
}

export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  return withTenantContext(tenantId, async (tx) => {
    const today = todayInArgentina()

    const [bookingsRow, revenueRow, abonadosRow] = await Promise.all([
      tx
        .select({ value: count() })
        .from(bookings)
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.date, today)))
        .then((r) => r[0]),

      tx
        .select({ value: sql<string>`COALESCE(SUM(${bookings.priceSnapshot}), 0)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            eq(bookings.date, today),
            inArray(bookings.status, ['confirmed', 'completed']),
          ),
        )
        .then((r) => r[0]),

      tx
        .select({ value: count() })
        .from(abonados)
        .where(and(eq(abonados.tenantId, tenantId), eq(abonados.status, 'active')))
        .then((r) => r[0]),
    ])

    return {
      bookingsToday: Number(bookingsRow?.value ?? 0),
      revenueTodayCents: Number(revenueRow?.value ?? 0),
      activeAbonados: Number(abonadosRow?.value ?? 0),
    }
  })
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
