import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { artDateOf } from '@/shared/time/art-date'
import { BookingDateOutOfRangeError } from './booking.errors'

/**
 * Un complejo dado de baja (`tenants.status = 'canceled'`) sigue operando
 * normalmente hasta el fin del período que ya pagó — pero NO puede ocupar una
 * cancha con fecha posterior a ese corte.
 *
 * El motivo es concreto: cuando vence el período, el sweep `canceled → blocked`
 * (`dunning-retry.worker.ts`) lo deja SIN acceso. Todo turno que caiga después
 * queda huérfano — el cliente lo tiene reservado (y muchas veces con la seña ya
 * cobrada en el MercadoPago del complejo) y el complejo no puede ni verlo.
 *
 * Este guard es la contrapartida de escritura del recorte de visualización que
 * hace `publicBookingAdvanceDays` (tenant.lifecycle.ts). Vive del lado del
 * SERVICE y no de las Server Actions a propósito: los cinco caminos que ocupan
 * una cancha —reserva manual, reserva online, abonado, reactivación de abonado
 * y horas de torneo— insertan en `bookings` por vías distintas, y una regla
 * puesta en las actions se le escapa a la próxima.
 *
 * Decisión del dueño, 2026-08-20.
 */

/**
 * Último día operativo ('YYYY-MM-DD' ART) que el complejo tiene pago, o `null`
 * si no hay tope que aplicar (cualquier estado que no sea `canceled`).
 *
 * Una sola query: `tenants` es global (sin RLS) y `tenant_subscriptions` está
 * aislada, pero todos los callers ya corren dentro del contexto del tenant (o
 * en el pool BYPASSRLS del worker), así que el LEFT JOIN se resuelve igual.
 *
 * `canceled` SIN período legible (fila ausente o `current_period_end` NULL) cae
 * en el lado restrictivo —hoy— por el mismo criterio que `isPublicPortalOpen`,
 * que con `null` da el portal por cerrado: sin período comprobable no se
 * conceden fechas futuras.
 */
export async function paidPeriodCutoff(tenantId: string, tx: DbTx): Promise<string | null> {
  const rows = (await tx.execute(sql`
    SELECT t.status::text AS status, s.current_period_end
    FROM tenants t
    LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id
    WHERE t.id = ${tenantId}
    LIMIT 1
  `)) as unknown as Array<{ status: string; current_period_end: Date | string | null }>

  const row = rows[0]
  if (!row) return null
  return paidPeriodCutoffFrom(row.status, row.current_period_end)
}

/**
 * La misma regla, sin ir a la base: para los callers que ya traen `status` y
 * `current_period_end` de una query propia — hoy el worker de generación
 * rodante, que los saca de su barrido cross-tenant y no puede pagar una query
 * extra por abonado. `paidPeriodCutoff` es esta función + el SELECT.
 */
export function paidPeriodCutoffFrom(
  status: string,
  currentPeriodEnd: Date | string | null,
): string | null {
  if (status !== 'canceled') return null
  // `tx.execute` crudo devuelve el timestamptz como string, no como Date: el
  // `new Date(...)` explícito no es decorativo.
  if (currentPeriodEnd === null) return artDateOf(new Date())
  return artDateOf(new Date(currentPeriodEnd))
}

/**
 * Rechaza el lote entero si alguna de las fechas cae después del corte.
 *
 * Rechazar vs. recortar se decide por la forma del pedido, no por el camino:
 *
 * - **Rechazan** (esta función) los pedidos de FECHAS EXPLÍCITAS — reserva
 *   manual, reserva online, mover un turno, y las horas de torneo, donde el
 *   admin eligió esas fechas a mano. Darle menos de lo que pidió sin decirle
 *   por qué sería peor que frenarlo con el motivo y la fecha de corte.
 * - **Recortan** (`paidPeriodCutoff` + filtro del lado del caller) los abonados
 *   y el worker de generación rodante, donde el pedido es "todas las que
 *   entren": ahí el corte es visible sin cartel de error porque la action ya
 *   devuelve `slotsGenerated`, y recortar mantiene coherente al que crea el
 *   abono con al que después lo sigue generando.
 */
export async function assertWithinPaidPeriod(
  tenantId: string,
  dates: readonly string[],
  tx: DbTx,
): Promise<void> {
  if (dates.length === 0) return
  const cutoff = await paidPeriodCutoff(tenantId, tx)
  if (cutoff === null) return
  for (const date of dates) {
    if (date > cutoff) throw new BookingDateOutOfRangeError('after_period_end', cutoff)
  }
}

/**
 * El mensaje que ven admin y encargado, en un solo lugar: lo comparten la carga
 * manual, el movimiento de un turno y la toma de horas de torneo, y decir tres
 * cosas distintas para la misma condición sólo confunde.
 */
export function paidPeriodErrorMessage(cutoff: string | undefined): string {
  if (!cutoff) {
    return 'El complejo está dado de baja: no se pueden tomar turnos después del fin del período que ya pagaste.'
  }
  const [y, m, d] = cutoff.split('-')
  return `El complejo está dado de baja: no se pueden tomar turnos después del ${d}/${m}/${y}, que es hasta cuándo llega el período que ya pagaste. Podés reactivar la suscripción desde Facturación.`
}
