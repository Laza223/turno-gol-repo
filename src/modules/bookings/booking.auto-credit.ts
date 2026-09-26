import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import {
  DEPOSIT_CASHFLOW_DESCRIPTION_PREFIX,
  depositCashFlowDescription,
  summarizeBookingCharges,
} from './booking.charges'

/**
 * Acreditación automática de lo no cobrado (decisión del dueño, 2026-09-26,
 * `docs/decisions/2026-09-25-caja-libro-de-la-noche.md`): un turno jugado que
 * sigue sin cobro registrado 24 h después de terminar se da por cobrado en
 * efectivo. En el piloto, lo que no se cobra en las primeras horas casi nunca
 * se cobra después, y la lista de no cobrados solo crecía.
 *
 * Las 24 h son las mismas que la corrección `completed → no_show` (P5,
 * `enforce_booking_invariants_fn`, que las cuenta desde `updated_at`): por eso
 * se exigen las dos marcas, `ends_at` y `updated_at`. Antes de eso el turno
 * todavía puede terminar como ausente y no hay que acreditarle plata.
 */
const AUTO_CREDIT_AFTER_HOURS = 24

/** Lo guardado dice que lo acreditó el sistema; el libro de Cuentas lo muestra como un cobro más. */
export const AUTO_CREDIT_DESCRIPTION = 'Acreditado solo: sin cobro registrado a las 24 h'

/**
 * Complejos donde corre: los que operan. Un complejo cancelado, bloqueado,
 * suspendido o dado de baja no se toca (en prod hay uno cancelado con turnos
 * sin cobrar).
 */
const AUTO_CREDIT_TENANT_STATUSES = ['trialing', 'active', 'past_due'] as const

/** Una sola acreditación automática por turno, pase lo que pase con los reintentos del cron. */
export function autoCreditIdempotencyKey(bookingId: string): string {
  return `auto-credit-24h-${bookingId}`
}

export type AutoCreditCandidate = { tenantId: string; bookingId: string }

const tenantStatusList = sql.join(
  AUTO_CREDIT_TENANT_STATUSES.map((s) => sql`${s}`),
  sql`, `,
)

/**
 * Turnos de TODOS los complejos vivos que ya pasaron el plazo con saldo. Es el
 * mismo cálculo de saldo que `getDebts` (booking.debts.ts): precio, menos la
 * seña si se pagó, menos los cobros de turno que no son la fila de la seña.
 * Cross-tenant: se corre con el pool del worker (BYPASSRLS).
 */
export async function findAutoCreditCandidates(tx: DbTx): Promise<AutoCreditCandidate[]> {
  const rows = await tx.execute(sql`
    SELECT b.tenant_id AS "tenantId", b.id AS "bookingId"
    FROM bookings b
    JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN cash_flows cf ON cf.booking_id = b.id AND cf.tenant_id = b.tenant_id
    WHERE b.status = 'completed'
      AND t.status::text IN (${tenantStatusList})
      AND b.ends_at < NOW() - make_interval(hours => ${AUTO_CREDIT_AFTER_HOURS})
      AND b.updated_at < NOW() - make_interval(hours => ${AUTO_CREDIT_AFTER_HOURS})
    GROUP BY b.id
    HAVING (
      b.price_snapshot - (
        CASE WHEN b.deposit_status IN ('paid', 'captured') THEN b.deposit_amount ELSE 0 END
      ) - COALESCE(
        SUM(cf.amount) FILTER (
          WHERE cf.type = 'income'
            AND cf.category = 'booking'
            AND cf.description <> (${DEPOSIT_CASHFLOW_DESCRIPTION_PREFIX} || b.id::text)
        ), 0
      )
    ) > 0
    ORDER BY b.tenant_id, b.ends_at
  `)
  return rows as unknown as AutoCreditCandidate[]
}

/**
 * Acredita UN turno en efectivo por lo que le falta. Devuelve los centavos
 * acreditados, o 0 si ya no correspondía (se cobró, cambió de estado o se
 * tocó en las últimas 24 h entre la búsqueda y este momento).
 *
 * Igual que `chargeDebtAction`: bloquea la fila del turno y recién ahí relee
 * los cobros, así un cobro de mostrador concurrente no termina sumando de más.
 * `staffUserId` es el actor "proxy" de la fila (`cash_flows.registered_by` es
 * NOT NULL): el primer admin activo del complejo, mismo patrón que la seña que
 * registra el webhook de MercadoPago. Quién lo hizo de verdad queda en el
 * audit log (actor `system`).
 */
export async function autoCreditBooking(
  tenantId: string,
  bookingId: string,
  staffUserId: string,
  tx: DbTx,
): Promise<number> {
  const locked = await tx.execute(sql`
    SELECT price_snapshot AS "priceSnapshot", deposit_amount AS "depositAmount",
           deposit_status AS "depositStatus"
    FROM bookings
    WHERE id = ${bookingId} AND tenant_id = ${tenantId}
      AND status = 'completed'
      AND ends_at < NOW() - make_interval(hours => ${AUTO_CREDIT_AFTER_HOURS})
      AND updated_at < NOW() - make_interval(hours => ${AUTO_CREDIT_AFTER_HOURS})
    FOR UPDATE
  `)
  const booking = (
    locked as unknown as Array<{
      priceSnapshot: number
      depositAmount: number
      depositStatus: string
    }>
  )[0]
  if (!booking) return 0

  const charged = await tx.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS "chargesTotal"
    FROM cash_flows
    WHERE tenant_id = ${tenantId} AND booking_id = ${bookingId}
      AND type = 'income' AND category = 'booking'
      AND description <> ${depositCashFlowDescription(bookingId)}
  `)
  const chargesTotal = (charged as unknown as Array<{ chargesTotal: number }>)[0]?.chargesTotal ?? 0

  const { pending } = summarizeBookingCharges({ ...booking, chargesTotal })
  if (pending <= 0) return 0

  await createCashFlow(
    tenantId,
    staffUserId,
    {
      type: 'income',
      category: 'booking',
      amount: pending,
      method: 'cash',
      description: AUTO_CREDIT_DESCRIPTION,
      bookingId,
      clientIdempotencyKey: autoCreditIdempotencyKey(bookingId),
    },
    tx,
  )
  return pending
}
