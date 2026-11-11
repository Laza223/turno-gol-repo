import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { FREE_ONLINE_BOOKINGS_PER_MONTH } from '@/shared/constants'
import { artMonthOf } from '@/modules/tenants/tenant.lifecycle'
import { FreeOnlineCapReachedError } from './booking.errors'

/**
 * Tope de reservas online del plan gratis (freemium, decisión 1: 20 por mes ART).
 *
 * Cuenta las online (`type='spontaneous' AND created_by_staff IS NULL`) creadas en
 * el mes ART, menos las vencidas sin pagar y las que canceló el jugador: las que
 * cancela el dueño cuentan, para que cancelar y volver a abrir no estire el tope.
 *
 * ORDEN DE LOCKS: este advisory lock es por complejo y va ANTES del de holds (por
 * jugador) y del de la cancha, así dos jugadores distintos no cuelan la 21.
 */
const MONTH_CREATED = sql`to_char(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM')`

/** Reservas online del mes ART que cuentan para el tope (Métricas del gratis también la usa). */
export async function countOnlineThisMonth(
  tenantId: string,
  month: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND type = 'spontaneous'
      AND created_by_staff IS NULL
      AND status <> 'expired'
      AND canceled_by IS DISTINCT FROM 'player'
      AND ${MONTH_CREATED} = ${month}
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

/**
 * Devuelve `true` si el complejo es gratis (el caller tiene que llamar a
 * `markFreeCapIfReached` después del INSERT). Tira `FreeOnlineCapReachedError`
 * si está pausado o ya llegó al tope.
 */
export async function assertFreeOnlineCap(tenantId: string, tx: DbTx): Promise<boolean> {
  const tenantRows = (await tx.execute(sql`
    SELECT status::text AS status FROM tenants WHERE id = ${tenantId} LIMIT 1
  `)) as unknown as Array<{ status: string }>
  const tenant = tenantRows[0]
  if (!tenant || tenant.status !== 'free') return false

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`free_online_cap:${tenantId}`}))`)
  // La pausa se relee bajo el lock: una que commiteó entre la lectura de arriba y
  // el lock no se vería.
  const pausedRows = (await tx.execute(sql`
    SELECT online_paused_at FROM tenants WHERE id = ${tenantId} LIMIT 1
  `)) as unknown as Array<{ online_paused_at: string | null }>
  if (pausedRows[0]?.online_paused_at != null) throw new FreeOnlineCapReachedError(tenantId)
  const count = await countOnlineThisMonth(tenantId, artMonthOf(), tx)
  if (count >= FREE_ONLINE_BOOKINGS_PER_MONTH) throw new FreeOnlineCapReachedError(tenantId)
  return true
}

/**
 * Después del INSERT (ya cuenta la fila nueva): si llegó al tope, marca el mes en
 * `tenants.online_cap_month` para que el portal pase a WhatsApp/Llamar sin contar.
 */
export async function markFreeCapIfReached(tenantId: string, tx: DbTx): Promise<void> {
  const month = artMonthOf()
  const count = await countOnlineThisMonth(tenantId, month, tx)
  if (count < FREE_ONLINE_BOOKINGS_PER_MONTH) return
  await tx.execute(sql`
    UPDATE tenants SET online_cap_month = ${month}
    WHERE id = ${tenantId} AND online_cap_month IS DISTINCT FROM ${month}
  `)
}
