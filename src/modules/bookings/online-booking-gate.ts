import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { isExpiredStatus } from '@/modules/tenants/tenant.lifecycle'
import { OnlineBookingNotAvailableError } from './booking.errors'

/**
 * Defensa en profundidad del alta online: un complejo en `trial_expired` (o su
 * alias `free`) no recibe reservas online nuevas aunque alguien llegue al
 * servicio sin pasar por las páginas, que ya esconden los horarios
 * (`canTakeOnlineBookings`). Corre dentro de la transacción del alta, así lee el
 * estado vigente y no uno cacheado. Solo bloquea CREAR: la confirmación por
 * webhook de una seña ya iniciada no pasa por acá.
 * docs/decisions/2026-11-27-prueba-30-dias-y-precios.md.
 */
export async function assertOnlineBookingOpen(tenantId: string, tx: DbTx): Promise<void> {
  const rows = (await tx.execute(sql`
    SELECT status::text AS status FROM tenants WHERE id = ${tenantId} LIMIT 1
  `)) as unknown as Array<{ status: string }>
  const status = rows[0]?.status
  if (status !== undefined && isExpiredStatus(status)) {
    throw new OnlineBookingNotAvailableError(tenantId)
  }
}
