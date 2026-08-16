import { and, count, eq, isNull } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { bookings, courts } from '@/shared/db/schema'
import { hasOperableDay } from '@/shared/time/operating-day'
import type { TenantRow, TenantSettings } from '@/modules/tenants/tenant.types'

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
  tenant: Pick<TenantRow, 'id' | 'openingHours' | 'closesNextDay'>,
  settings: TenantSettings,
  mpConnected: boolean,
): Promise<ChecklistState> {
  const tenantId = tenant.id
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
        .where(and(eq(bookings.tenantId, tenantId), isNull(bookings.createdByStaff)))
        .limit(1)
        .then((r) => r[0] ?? null),
    ])

    return {
      accountCreated: true,
      // Constante a propósito, no un chequeo pendiente: `name`, `address`,
      // `city`, `province`, `phone` y `email` son NOT NULL en `tenants`, así que
      // un complejo sin datos no existe. Un chequeo acá no podría dar false
      // nunca — sería teatro.
      complexData: true,
      hasCourts: courtsCount > 0,
      // Esto SÍ puede dar false: estaba hardcodeado a `true` y por eso decía
      // "Horarios definidos ✓" a un complejo cuyos siete días quedaron cerrados
      // (o con rangos que no generan un solo turno) después de editarlos en
      // Configuración. La checklist responde "¿puedo recibir reservas?": un
      // complejo sin un día operable no puede, y tiene que verlo.
      hasSchedule: hasOperableDay(tenant.openingHours, tenant.closesNextDay),
      mpConnected,
      publicLinkShared: settings.public_link_shared === true,
      firstBookingReceived: firstBooking !== null,
    }
  })
}
