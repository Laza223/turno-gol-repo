import { sql } from 'drizzle-orm'
import { payments } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'

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

/**
 * Una devolución de seña que el complejo todavía debe.
 *
 * `method` acá es "por dónde se esperaba que viajara", no por dónde viajó: eso
 * se decide recién al saldarla.
 */
export type PendingRefundRow = {
  refundPaymentId: string
  bookingId: string | null
  amountCents: number
  method: string
  /** Desde cuándo se debe. Es la antigüedad que se muestra en la lista. */
  since: Date
  debtorName: string
  /** Para el link de WhatsApp al jugador. `null` en turnos de invitado sin teléfono. */
  contactPhone: string | null
  /**
   * Último recurso de contacto. Sin esto, la fila de un jugador sin teléfono
   * cargado no ofrecía NINGÚN canal: el complejo veía a quién le debe y no
   * tenía cómo avisarle desde ahí. `players.email` es NOT NULL, así que
   * siempre hay algo mientras la reserva tenga dueño con cuenta.
   */
  contactEmail: string | null
  courtName: string | null
  date: string | null
  timeStart: string | null
}

/**
 * Las devoluciones pendientes de un complejo, de la más vieja a la más nueva.
 *
 * Deliberadamente NO entra en `getStreetMoney`: esa función es la fuente única
 * del total de "plata en la calle", o sea lo que le DEBEN al complejo. Una
 * devolución es lo contrario —lo que el complejo debe— y sumarla ahí rompería
 * el invariante que `street-money-total.test.ts` compara por dos caminos.
 */
/**
 * Qué devolución le toca resolver al complejo: **todas, desde el momento cero**.
 *
 * Hubo una espera de una hora para las que habían pasado por MercadoPago, y
 * tenía sentido mientras existía el reembolso automático: pedirle acción al
 * complejo por algo que el reintento todavía podía resolver solo abría la
 * ventana para que la plata saliera dos veces —a mano y después por la API—, y
 * la clave de idempotencia del SDK no protegía de eso. Sin reembolso
 * automático no hay segunda mano que pueda pagar, así que esperar una hora
 * para mostrar una deuda que ya existe es solo esconderla.
 */

export async function listPendingRefunds(tenantId: string, tx: DbTx): Promise<PendingRefundRow[]> {
  const rows = await tx.execute(sql`
    SELECT p.id            AS "refundPaymentId",
           p.booking_id    AS "bookingId",
           p.amount        AS "amountCents",
           p.method        AS "method",
           p.created_at    AS "since",
           COALESCE(pl.first_name || ' ' || pl.last_name, b.guest_name, 'Sin nombre') AS "debtorName",
           COALESCE(pl.phone, b.guest_phone) AS "contactPhone",
           pl.email        AS "contactEmail",
           c.name          AS "courtName",
           b.date::text    AS "date",
           b.time_start::text AS "timeStart"
    FROM payments p
    LEFT JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN courts c ON c.id = b.court_id
    LEFT JOIN players pl ON pl.id = p.player_id
    WHERE p.tenant_id = ${tenantId}
      AND p.type = 'refund'
      AND p.status = 'pending'
    ORDER BY p.created_at ASC
  `)
  return rows as unknown as PendingRefundRow[]
}

/**
 * Resumen para la alerta del panel: cuántas devoluciones se deben y por cuánto.
 *
 * Cuenta exactamente las mismas filas que lista `listPendingRefunds`: la
 * pantalla y la alerta divergían, y el panel mostraba una fila que el contador
 * no contaba. Cualquier filtro que se agregue va en las DOS queries.
 */
export async function countPendingRefunds(
  tenantId: string,
  tx: DbTx,
): Promise<{ count: number; totalCents: number; oldestAt: Date | null }> {
  const rows = await tx.execute(sql`
    SELECT COUNT(*)::int          AS "count",
           COALESCE(SUM(p.amount), 0)::int AS "totalCents",
           MIN(p.created_at)      AS "oldestAt"
    FROM payments p
    WHERE p.tenant_id = ${tenantId}
      AND p.type = 'refund'
      AND p.status = 'pending'
  `)
  const row = (
    rows as unknown as Array<{ count: number; totalCents: number; oldestAt: Date | null }>
  )[0]
  return row ?? { count: 0, totalCents: 0, oldestAt: null }
}

export type SettledRefund = {
  refundPaymentId: string
  bookingId: string | null
  amountCents: number
}

/**
 * El complejo marca que ya devolvió la seña.
 *
 * Idempotente por el `WHERE status = 'pending'`: si dos personas del staff
 * tildan la misma fila a la vez, la segunda encuentra 0 filas y devuelve
 * `undefined`. Bajo READ COMMITTED el segundo UPDATE se bloquea en el lock de
 * fila del primero y reevalúa su `WHERE` contra la versión ya commiteada, así
 * que no hace falta ni advisory lock ni `SELECT ... FOR UPDATE`. Eso es lo que
 * garantiza un solo audit log y un solo movimiento de caja.
 *
 * No hay forma de destildar (decisión del dueño): `processed_at` + `method` +
 * el audit log son la prueba de que se hizo, y un estado de plata reversible es
 * un vector de fraude interno.
 */
export async function markRefundSettled(
  opts: { refundPaymentId: string; tenantId: string; method: string; staffUserId: string },
  tx: DbTx,
): Promise<SettledRefund | undefined> {
  const rows = await tx.execute(sql`
    UPDATE payments
    SET status = 'approved', processed_at = NOW(), method = ${opts.method}::payment_method
    WHERE id = ${opts.refundPaymentId}
      AND tenant_id = ${opts.tenantId}
      AND type = 'refund'
      AND status = 'pending'
    RETURNING id AS "refundPaymentId", booking_id AS "bookingId", amount AS "amountCents"
  `)
  const settled = (rows as unknown as SettledRefund[])[0]
  if (!settled) return undefined

  await insertAuditLog(tx, {
    tenantId: opts.tenantId,
    actorId: opts.staffUserId,
    actorType: 'staff',
    action: 'payment.refund_settled_manually',
    resourceType: 'payment',
    resourceId: settled.refundPaymentId,
    metadata: {
      bookingId: settled.bookingId,
      amount: settled.amountCents,
      method: opts.method,
    },
  })

  return settled
}
