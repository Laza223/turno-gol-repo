import type { Sql } from 'postgres'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import { logger } from '@/shared/lib/logger'

/**
 * Fase D4 §7 (RI #3) — reconciliación contable DB-local entre `payments` ↔
 * `cash_flows` ↔ `bookings`. Invariantes 1-5+9 del diseño (report
 * docs/audit/reports/fase-d4-flujos-integridad-report.md §7); las #7/#8
 * (requieren API de MP + throttling) quedan en fase 2, fuera de alcance acá.
 *
 * Margen de 15 minutos en toda query filtrada por `created_at`/`updated_at`:
 * una tx todavía en vuelo (p.ej. `createDepositPayment` recién insertó el
 * `payments` row pero `recordDepositCashFlow` corre unos ms después, misma
 * tx o post-commit) no debe leerse como drift real.
 */

const DRIFT_QUERY_LIMIT = 500

export type DriftInvariant =
  | 'inv1_payment_without_cashflow'
  | 'inv2_amount_mismatch_cashflow'
  | 'inv3_amount_mismatch_booking'
  | 'inv4_booking_without_payment'
  | 'inv5_refund_not_reflected'
  | 'inv9_orphan_cashflow'

export type DriftFinding = {
  invariant: DriftInvariant
  tenantId: string
  resourceType: 'payment' | 'booking' | 'cash_flow'
  resourceId: string
  metadata: Record<string, unknown>
}

/** Avisa (sin fallar) cuando una query pegó el LIMIT — cobertura fase 1 acotada a 500 filas. */
function warnIfTruncated(rowCount: number, invariant: DriftInvariant): void {
  if (rowCount === DRIFT_QUERY_LIMIT) {
    logger.warn(`posible truncamiento, más de 500 filas con drift en ${invariant}`, {
      module: 'reconciliation.service',
      invariant,
    })
  }
}

type ApprovedDepositPayment = {
  id: string
  tenantId: string
  bookingId: string
  amount: number
  mpPaymentId: string | null
}

/**
 * Candidatos compartidos por INV1/INV2: payments `approved` de tipo `deposit`
 * vía `mercadopago` con `booking_id` conocido — el universo sobre el que se
 * busca (o se compara el monto contra) el cash_flow reflejo.
 */
async function fetchApprovedDepositPayments(sql: Sql): Promise<ApprovedDepositPayment[]> {
  return sql<ApprovedDepositPayment[]>`
    SELECT id, tenant_id AS "tenantId", booking_id AS "bookingId", amount,
           mp_payment_id AS "mpPaymentId"
    FROM payments
    WHERE status = 'approved'
      AND type = 'deposit'
      AND method = 'mercadopago'
      AND booking_id IS NOT NULL
      AND created_at < NOW() - INTERVAL '15 minutes'
    ORDER BY created_at ASC
    LIMIT ${DRIFT_QUERY_LIMIT}
  `
}

type DepositCashFlow = { id: string; bookingId: string; amount: number; description: string }

/** cash_flows candidatos (booking + método) para cruzar contra `fetchApprovedDepositPayments`. */
async function fetchCandidateCashFlows(sql: Sql, bookingIds: string[]): Promise<DepositCashFlow[]> {
  if (bookingIds.length === 0) return []
  return sql<DepositCashFlow[]>`
    SELECT id, booking_id AS "bookingId", amount, description
    FROM cash_flows
    WHERE booking_id = ANY(${bookingIds})
      AND category = 'booking'
      AND method = 'mercadopago'
  `
}

/**
 * INV1 — todo payment `approved` (deposit, mercadopago) debe tener su
 * cash_flow reflejo (detecta los no-op silenciosos de `recordDepositCashFlow`,
 * que traga errores para no perder el pago capturado — payment.service.ts).
 * Match por `description` exacta (`depositCashFlowDescription`), mismo idiom
 * que `getBookingCharges` (reservas/queries.ts:219).
 */
async function findPaymentsWithoutCashflow(sql: Sql): Promise<DriftFinding[]> {
  const paymentRows = await fetchApprovedDepositPayments(sql)
  if (paymentRows.length === 0) return []

  const bookingIds = paymentRows.map((p) => p.bookingId)
  const cashFlowRows = await fetchCandidateCashFlows(sql, bookingIds)

  const descriptionsByBooking = new Map<string, Set<string>>()
  for (const cf of cashFlowRows) {
    const set = descriptionsByBooking.get(cf.bookingId) ?? new Set<string>()
    set.add(cf.description)
    descriptionsByBooking.set(cf.bookingId, set)
  }

  const findings: DriftFinding[] = []
  for (const p of paymentRows) {
    const hasMatch =
      descriptionsByBooking.get(p.bookingId)?.has(depositCashFlowDescription(p.bookingId)) ?? false
    if (!hasMatch) {
      findings.push({
        invariant: 'inv1_payment_without_cashflow',
        tenantId: p.tenantId,
        resourceType: 'payment',
        resourceId: p.id,
        metadata: { bookingId: p.bookingId, amount: p.amount, mpPaymentId: p.mpPaymentId },
      })
    }
  }

  warnIfTruncated(paymentRows.length, 'inv1_payment_without_cashflow')
  return findings
}

/**
 * INV2 — de los pares que SÍ matchean por `description` (INV1), el monto
 * debe cuadrar. Un mismatch acá es más grave que INV1: el cash_flow existe
 * pero miente sobre cuánto entró (p.ej. el bug histórico mock amount=1).
 */
async function findCashflowAmountMismatch(sql: Sql): Promise<DriftFinding[]> {
  const paymentRows = await fetchApprovedDepositPayments(sql)
  if (paymentRows.length === 0) return []

  const bookingIds = paymentRows.map((p) => p.bookingId)
  const cashFlowRows = await fetchCandidateCashFlows(sql, bookingIds)

  const cashFlowByBookingAndDescription = new Map<string, DepositCashFlow>()
  for (const cf of cashFlowRows) {
    cashFlowByBookingAndDescription.set(`${cf.bookingId}::${cf.description}`, cf)
  }

  const findings: DriftFinding[] = []
  for (const p of paymentRows) {
    const match = cashFlowByBookingAndDescription.get(
      `${p.bookingId}::${depositCashFlowDescription(p.bookingId)}`,
    )
    if (match && match.amount !== p.amount) {
      findings.push({
        invariant: 'inv2_amount_mismatch_cashflow',
        tenantId: p.tenantId,
        resourceType: 'cash_flow',
        resourceId: match.id,
        metadata: {
          bookingId: p.bookingId,
          paymentAmount: p.amount,
          cashFlowAmount: match.amount,
          paymentId: p.id,
        },
      })
    }
  }

  warnIfTruncated(paymentRows.length, 'inv2_amount_mismatch_cashflow')
  return findings
}

/**
 * INV3 — el monto del payment debe cuadrar contra `bookings.deposit_amount`.
 * Habría cazado el bug mock amount=1 aun sin mirar cash_flows.
 */
async function findBookingAmountMismatch(sql: Sql): Promise<DriftFinding[]> {
  const rows = await sql<{
    id: string
    tenantId: string
    bookingId: string
    paymentAmount: number
    bookingDepositAmount: number
  }[]>`
    SELECT p.id, p.tenant_id AS "tenantId", p.booking_id AS "bookingId",
           p.amount AS "paymentAmount", b.deposit_amount AS "bookingDepositAmount"
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    WHERE p.status = 'approved'
      AND p.type = 'deposit'
      AND p.method = 'mercadopago'
      AND p.amount <> b.deposit_amount
      AND p.created_at < NOW() - INTERVAL '15 minutes'
    ORDER BY p.created_at ASC
    LIMIT ${DRIFT_QUERY_LIMIT}
  `

  warnIfTruncated(rows.length, 'inv3_amount_mismatch_booking')

  return rows.map((row) => ({
    invariant: 'inv3_amount_mismatch_booking' as const,
    tenantId: row.tenantId,
    resourceType: 'payment' as const,
    resourceId: row.id,
    metadata: {
      bookingId: row.bookingId,
      paymentAmount: row.paymentAmount,
      bookingDepositAmount: row.bookingDepositAmount,
    },
  }))
}

/**
 * INV4 — todo booking con seña MP ya cobrada/capturada (`deposit_status IN
 * ('paid','captured')`) debe tener un payment `approved` que lo respalde.
 *
 * Limitación conocida (NO se resuelve acá — es una decisión de producto/UX
 * para un esfuerzo futuro, no de esta feature de reconciliación): esta
 * invariante puede disparar un finding permanente y legítimo cuando un
 * jugador reserva online con seña → se genera preferencia MP
 * (`bookings.payment_method` pasa a 'mercadopago') → el pago se
 * abandona/rechaza → el encargado confirma el pago en efectivo con
 * `confirmDepositPaymentAction` (src/app/(admin)/reservas/actions.ts), que
 * solo llama `transitionFromPendingPayment(bookingId, 'confirmed', tx)` y NO
 * actualiza `payment_method` ni crea ningún `cash_flow`. Confirmado por
 * lectura de código: no hay forma de diferenciar este caso legítimo de un
 * bug real (MP aprobó pero perdimos el registro) sin tocar ese flujo de
 * negocio. El fix de fondo sería que `confirmDepositPaymentAction` actualice
 * `payment_method` al confirmar un pago fuera de MP.
 *
 * Mientras tanto, `latestPaymentStatus`/`latestPaymentMpPreferenceId` en el
 * metadata (payment más reciente del booking, cualquier status/type; `null`
 * si no hay ninguno) le dan al humano que revisa el finding en el audit
 * trail una pista para diferenciar "no hay ningún payment row" (más
 * sospechoso) de "hay un payment row en `pending` con `mp_preference_id`"
 * (huella de checkout MP abandonado + confirmación manual, causa conocida).
 */
async function findBookingsWithoutApprovedPayment(sql: Sql): Promise<DriftFinding[]> {
  const rows = await sql<{
    id: string
    tenantId: string
    depositStatus: string
    depositAmount: number
    latestPaymentStatus: string | null
    latestPaymentMpPreferenceId: string | null
  }[]>`
    SELECT b.id, b.tenant_id AS "tenantId", b.deposit_status AS "depositStatus",
           b.deposit_amount AS "depositAmount",
           latest_payment.status AS "latestPaymentStatus",
           latest_payment.mp_preference_id AS "latestPaymentMpPreferenceId"
    FROM bookings b
    LEFT JOIN LATERAL (
      SELECT p.status, p.mp_preference_id
      FROM payments p
      WHERE p.booking_id = b.id
      ORDER BY p.created_at DESC
      LIMIT 1
    ) latest_payment ON true
    WHERE b.payment_method = 'mercadopago'
      AND b.deposit_status IN ('paid', 'captured')
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.booking_id = b.id AND p.status = 'approved' AND p.type = 'deposit'
      )
      AND b.updated_at < NOW() - INTERVAL '15 minutes'
    ORDER BY b.updated_at ASC
    LIMIT ${DRIFT_QUERY_LIMIT}
  `

  warnIfTruncated(rows.length, 'inv4_booking_without_payment')

  return rows.map((row) => ({
    invariant: 'inv4_booking_without_payment' as const,
    tenantId: row.tenantId,
    resourceType: 'booking' as const,
    resourceId: row.id,
    metadata: {
      depositStatus: row.depositStatus,
      depositAmount: row.depositAmount,
      latestPaymentStatus: row.latestPaymentStatus,
      latestPaymentMpPreferenceId: row.latestPaymentMpPreferenceId,
    },
  }))
}

/**
 * INV5 — un refund `approved` debe reflejarse en `bookings.deposit_status =
 * 'refunded'`. Complementa la observabilidad de F3 (refund externo detectado
 * en el webhook, payment.service.ts) con una segunda red: cualquier refund
 * approved (externo o local) cuyo booking no llegó a `refunded`.
 */
async function findUnreflectedRefunds(sql: Sql): Promise<DriftFinding[]> {
  const rows = await sql<{
    id: string
    tenantId: string
    bookingId: string
    currentDepositStatus: string
  }[]>`
    SELECT p.id, p.tenant_id AS "tenantId", p.booking_id AS "bookingId",
           b.deposit_status AS "currentDepositStatus"
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    WHERE p.status = 'approved'
      AND p.type = 'refund'
      AND b.deposit_status <> 'refunded'
      AND p.created_at < NOW() - INTERVAL '15 minutes'
    ORDER BY p.created_at ASC
    LIMIT ${DRIFT_QUERY_LIMIT}
  `

  warnIfTruncated(rows.length, 'inv5_refund_not_reflected')

  return rows.map((row) => ({
    invariant: 'inv5_refund_not_reflected' as const,
    tenantId: row.tenantId,
    resourceType: 'payment' as const,
    resourceId: row.id,
    metadata: { bookingId: row.bookingId, currentDepositStatus: row.currentDepositStatus },
  }))
}

/**
 * INV9 — cash_flow de categoría `booking` vía `mercadopago` sin ningún
 * payment `approved` que lo respalde: huérfano (guardia — plata que aparece
 * en caja sin origen rastreable en `payments`).
 */
async function findOrphanCashflows(sql: Sql): Promise<DriftFinding[]> {
  const rows = await sql<{
    id: string
    tenantId: string
    bookingId: string
    amount: number
  }[]>`
    SELECT cf.id, cf.tenant_id AS "tenantId", cf.booking_id AS "bookingId", cf.amount
    FROM cash_flows cf
    WHERE cf.category = 'booking'
      AND cf.method = 'mercadopago'
      AND cf.booking_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.booking_id = cf.booking_id AND p.status = 'approved'
      )
      AND cf.created_at < NOW() - INTERVAL '15 minutes'
    ORDER BY cf.created_at ASC
    LIMIT ${DRIFT_QUERY_LIMIT}
  `

  warnIfTruncated(rows.length, 'inv9_orphan_cashflow')

  return rows.map((row) => ({
    invariant: 'inv9_orphan_cashflow' as const,
    tenantId: row.tenantId,
    resourceType: 'cash_flow' as const,
    resourceId: row.id,
    metadata: { bookingId: row.bookingId, amount: row.amount },
  }))
}

const DRIFT_CHECKS: ReadonlyArray<{
  invariant: DriftInvariant
  run: (sql: Sql) => Promise<DriftFinding[]>
}> = [
  { invariant: 'inv1_payment_without_cashflow', run: findPaymentsWithoutCashflow },
  { invariant: 'inv2_amount_mismatch_cashflow', run: findCashflowAmountMismatch },
  { invariant: 'inv3_amount_mismatch_booking', run: findBookingAmountMismatch },
  { invariant: 'inv4_booking_without_payment', run: findBookingsWithoutApprovedPayment },
  { invariant: 'inv5_refund_not_reflected', run: findUnreflectedRefunds },
  { invariant: 'inv9_orphan_cashflow', run: findOrphanCashflows },
]

/**
 * Corre las 6 invariantes vía `Promise.allSettled`: una que tira no debe
 * tumbar las demás (aislamiento entre checks independientes).
 */
export async function runAccountingReconciliation(sql: Sql): Promise<DriftFinding[]> {
  const results = await Promise.allSettled(DRIFT_CHECKS.map((check) => check.run(sql)))

  const findings: DriftFinding[] = []
  results.forEach((result, i) => {
    const { invariant } = DRIFT_CHECKS[i]
    if (result.status === 'fulfilled') {
      findings.push(...result.value)
    } else {
      logger.error(`reconciliation check failed: ${invariant}`, {
        module: 'reconciliation.service',
        invariant,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })

  return findings
}
