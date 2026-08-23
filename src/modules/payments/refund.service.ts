import { sql } from 'drizzle-orm'
import { payments } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'

/**
 * Devoluciones de seña que NO viajan por MercadoPago.
 *
 * Contexto de por qué existe este archivo: el reembolso automático de MP falla
 * siempre (403 — MP deriva los scopes del PRODUCTO de la aplicación y ninguna
 * de las probadas concede `payments:refunds`), así que la devolución la termina
 * de hacer el complejo. Para que eso sea gestionable hace falta que TODA
 * obligación de devolver quede registrada, no solo las que pasaron por MP.
 *
 * El registro es una fila en `payments` con `type='refund'`, y no una columna
 * en `bookings`, por una razón dura: `canceled_refunded` es un estado terminal
 * y el trigger `enforce_booking_invariants_fn` (migr. 070) rechaza cualquier
 * UPDATE sobre un booking terminal. La fila del turno queda congelada apenas se
 * cancela — no hay dónde escribir después "ya devolví". Ampliar ese trigger
 * para guardar un booleano que `payments` ya modela sería el peor cambio
 * posible: cada `CREATE OR REPLACE` de esa función arriesga perder el
 * `SET search_path` (ver los encabezados de las migraciones 060 y 070) y
 * agranda una invariante que protege plata.
 */

/**
 * `description` de una devolución que no tiene pago de MercadoPago detrás.
 *
 * Deliberadamente NO usa el shape `'Refund of <paymentId>'` de `prepareRefund`.
 * Ese string es una clave de join real en dos lugares — el `LEFT JOIN payments
 * op ON p.description = 'Refund of ' || op.id::text` de
 * `retry-refunds.worker.ts` y el guard de sobre-reembolso de `prepareRefund` —,
 * así que una colisión haría que el worker intentara reembolsar contra MP una
 * seña que se cobró en efectivo. El prefijo distinto es la barrera.
 */
export function manualRefundDescription(bookingId: string): string {
  return `Manual refund of booking ${bookingId}`
}

type ManualRefundInput = {
  bookingId: string
  tenantId: string
  playerId: string | null
  /** Centavos. Es siempre la seña entera: no existen devoluciones parciales. */
  amount: number
  /** `bookings.payment_method`. Determina por dónde se espera que viaje la plata. */
  paymentMethod: string | null
}

/**
 * Registra la obligación de devolver una seña que se cobró FUERA de MercadoPago
 * (efectivo o transferencia). Corre dentro de la transacción del caller, igual
 * que `prepareRefund`, para que la cancelación y la deuda commiteen juntas.
 *
 * No puede derivarse de `prepareRefund`: una seña confirmada a mano no tiene
 * ninguna fila en `payments` (`confirmManualDepositPayment` deja
 * `bookings.payment_id` en NULL porque lo exige `chk_booking_payment_consistency`
 * y solo escribe un `cash_flows` de ingreso), así que no hay pago original que
 * lockear, ni `mp_payment_id`, ni monto contra el cual validar.
 *
 * `method` queda seteado al medio real de la seña — nunca `mercadopago` — y eso
 * es lo que mantiene la fila fuera del alcance del retry automático.
 *
 * @returns el id de la fila creada, o `undefined` si ya había una devolución
 *   viva para esa reserva (idempotente: cancelar dos veces no duplica la deuda).
 */
export async function prepareManualRefund(
  input: ManualRefundInput,
  tx: DbTx,
): Promise<string | undefined> {
  const existing = await tx.execute(sql`
    SELECT 1
    FROM payments
    WHERE booking_id = ${input.bookingId}
      AND type = 'refund'
      AND status IN ('approved', 'pending')
    LIMIT 1
  `)
  if ((existing as unknown as unknown[]).length > 0) return undefined

  const inserted = await tx
    .insert(payments)
    .values({
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      playerId: input.playerId,
      amount: input.amount,
      currency: 'ARS',
      type: 'refund',
      // 'other' cubre el dato incompleto: sin medio conocido la devolución
      // igual existe, y el complejo elige por dónde la hace al saldarla.
      method:
        input.paymentMethod === 'cash' || input.paymentMethod === 'transfer'
          ? input.paymentMethod
          : 'other',
      status: 'pending',
      description: manualRefundDescription(input.bookingId),
    })
    .returning({ id: payments.id })

  return inserted[0]!.id
}
