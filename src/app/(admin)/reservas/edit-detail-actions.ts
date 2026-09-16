'use server'

import { sql } from 'drizzle-orm'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { uuid } from '@/shared/validation/primitives'

/**
 * Lectura mínima para precargar `BookingEditDialog` (D2). `GridBooking` no
 * trae `guestPhone` ni `createdByStaff` — sumarlos a la query de la grilla
 * ensancharía sus DOS consumidores de Realtime (`use-booking-realtime.ts`:
 * el payload de `postgres_changes` y el de `/api/bookings`), que no son
 * archivos de este esfuerzo. Se piden recién al abrir el diálogo en vez de
 * cargarlos siempre para toda la grilla.
 *
 * `createdByStaff` decide si el turno es "online" (`NULL`, lo creó un
 * jugador) — mismo predicado que usa el contador del aha moment en
 * `booking.service.ts` — y por lo tanto si se puede ofrecer editar la
 * duración (D2: nunca en una reserva online).
 */
export type BookingEditDetailResult =
  | { success: true; guestPhone: string | null; createdByStaff: string | null }
  | { success: false; error: string }

export async function getBookingEditDetailAction(
  bookingId: string,
): Promise<BookingEditDetailResult> {
  const parsed = uuid.safeParse(bookingId)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const rows = await withTenantContext(tenant.id, (tx) =>
    tx.execute(sql`
      SELECT guest_phone AS "guestPhone", created_by_staff AS "createdByStaff"
      FROM bookings
      WHERE id = ${bookingId} AND tenant_id = ${tenant.id}
      LIMIT 1
    `),
  )
  const row = (
    rows as unknown as Array<{ guestPhone: string | null; createdByStaff: string | null }>
  )[0]
  if (!row) return { success: false, error: 'La reserva no existe.' }

  return { success: true, guestPhone: row.guestPhone, createdByStaff: row.createdByStaff }
}
