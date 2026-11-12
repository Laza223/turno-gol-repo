import { and, count, eq, isNotNull, isNull, notInArray } from 'drizzle-orm'
import { getDb, withTenantContext } from '@/shared/db/client'
import { bookings, courts, tenants } from '@/shared/db/schema'
import { hasOperableDay } from '@/shared/time/operating-day'
import type { TenantRow, TenantSettings } from '@/modules/tenants/tenant.types'

export interface ChecklistState {
  accountCreated: boolean
  hasCourts: boolean
  hasSchedule: boolean
  /** Alguna reserva no cancelada cargada por el staff (`created_by_staff` no nulo). */
  hasStaffBookings: boolean
  mpConnected: boolean
  publicLinkShared: boolean
  firstBookingReceived: boolean
}

export async function getChecklistState(
  tenant: Pick<TenantRow, 'id' | 'openingHours' | 'closesNextDay'>,
  settings: TenantSettings,
  mpConnected: boolean,
): Promise<ChecklistState> {
  const tenantId = tenant.id
  return withTenantContext(tenantId, async (tx) => {
    const [courtsCount, firstBooking, staffBooking] = await Promise.all([
      tx
        .select({ value: count() })
        .from(courts)
        .where(eq(courts.tenantId, tenantId))
        .then((r) => Number(r[0]?.value ?? 0)),

      tx
        .select({ id: bookings.id })
        .from(bookings)
        // 'spontaneous' + created_by_staff NULL: solo created_by_staff no
        // alcanza — los fijos de abonado (alta y worker rolling) también
        // nacen con esa columna en NULL sin ser una reserva online (QA
        // 2026-09-13, mismo predicado en home.service.ts/booking.service.ts).
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            eq(bookings.type, 'spontaneous'),
            isNull(bookings.createdByStaff),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null),

      tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            isNotNull(bookings.createdByStaff),
            notInArray(bookings.status, ['canceled_refunded', 'canceled_no_refund']),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null),
    ])

    return {
      accountCreated: true,
      hasCourts: courtsCount > 0,
      // Esto SÍ puede dar false: estaba hardcodeado a `true` y por eso decía
      // "Horarios definidos ✓" a un complejo cuyos siete días quedaron cerrados
      // (o con rangos que no generan un solo turno) después de editarlos en
      // Configuración. La checklist responde "¿puedo recibir reservas?": un
      // complejo sin un día operable no puede, y tiene que verlo.
      hasSchedule: hasOperableDay(tenant.openingHours, tenant.closesNextDay),
      hasStaffBookings: staffBooking !== null,
      mpConnected,
      publicLinkShared: settings.public_link_shared === true,
      firstBookingReceived: firstBooking !== null,
    }
  })
}

/**
 * Código de referido del tenant, o `null` si el super-admin todavía no lo
 * generó. `TenantRow` (el que arma `getStaffTenant` para el guard) no trae
 * `referral_code`: sumarlo ahí tocaría el mapper que también usan
 * `getTenantById` y toda la impersonación, para un dato que solo lee el
 * aviso de Hoy. Proyección explícita de columnas: `tenants` es global y sin
 * RLS (`.claude/rules/tablas-y-rls.md`), así que la proyección es la única
 * barrera contra devolver de más.
 */
export async function getTenantReferralCode(tenantId: string): Promise<string | null> {
  const db = getDb()
  const rows = await db
    .select({ referralCode: tenants.referralCode })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return rows[0]?.referralCode ?? null
}
