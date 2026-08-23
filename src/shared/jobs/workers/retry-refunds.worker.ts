import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { describeMpError } from '@/modules/payments/mp-token-refresh'
import { settleRefund, formatArs, type PreparedRefund } from '@/modules/payments/payment.service'
import {
  enqueueTenantOwnerNotification,
  dispatchEmail,
} from '@/modules/notifications/notification.service'
import { CRON_WORK_OPTIONS, QUEUE_RETRY_PENDING_REFUNDS } from '../definitions'
import { track } from '@/shared/observability'
import { logger } from '@/shared/lib/logger'

const ALERT_AFTER_HOURS = 24
const ALERT_TEMPLATE = 'admin_refund_failed' as const

type PendingRefundRow = {
  refundPaymentId: string
  tenantId: string
  bookingId: string | null
  refundAmount: number
  createdAt: Date
  /** mp_payment_id del pago ORIGINAL (deposit/full_payment) que se está
   * reembolsando — es lo que `settleRefund` necesita para llamar a MP.
   * NULL solo si el join por `description = 'Refund of <id>'` no encuentra
   * el pago original (no debería pasar; se salta con log si ocurre). */
  originalMpPaymentId: string | null
  /** Monto del pago original, para decidir si el reembolso va como TOTAL. */
  originalAmount: number | null
  /** Lo ya reembolsado por OTRAS filas contra el mismo pago original. */
  otrosRefunds: number
  mpAccessToken: string
}

/**
 * ENS-19: un refund contra MP que falla queda `payments.status='pending'`
 * para siempre — el catch original solo mandaba a Sentry, sin retry ni
 * alerta. Cron horario (ver `registerRetryRefundsWorker`).
 *
 * Reintenta contra MP cada refund `pending` con más de 1 hora de antigüedad
 * (ver el `INTERVAL '1 hour'` del query — cron corre cada hora, así que un
 * intento fallido siempre entra en la próxima corrida), reusando `settleRefund` (payment.service.ts) TAL CUAL — su
 * idempotency key (`refund:${refundPaymentId}`) ya es determinística por el
 * id de la fila de refund, así que reintentar con el MISMO `refundPaymentId`
 * reusa la MISMA key sin necesidad de tocar esa función ni de guardar la key
 * en ningún lado nuevo.
 *
 * Si sigue `pending` tras `ALERT_AFTER_HOURS`, encola UNA alerta al dueño
 * (dedupeada contra `notifications`: busca una fila existente con el mismo
 * `template_name` + `content->>'refundPaymentId'` antes de encolar) — el
 * worker sigue reintentando en corridas futuras, pero no vuelve a avisar.
 */
export async function retryPendingRefunds(): Promise<{ retried: number; alerted: number }> {
  // Cross-tenant scan (mismo patrón que reconcile-pending-payments.worker.ts):
  // necesita el pool de servicio, un rol restringido no vería refunds de otros
  // tenants bajo RLS. El JOIN a `op` (pago original) reconstruye el link que
  // `prepareRefund` solo dejó en `description` ('Refund of <id>'), igual que
  // el guard de sobre-reembolso en esa misma función.
  const sql = getWorkerSql()

  const rows = await sql<PendingRefundRow[]>`
    SELECT
      p.id              AS "refundPaymentId",
      p.tenant_id       AS "tenantId",
      p.booking_id      AS "bookingId",
      p.amount          AS "refundAmount",
      p.created_at      AS "createdAt",
      op.mp_payment_id  AS "originalMpPaymentId",
      op.amount         AS "originalAmount",
      COALESCE((
        SELECT SUM(pr.amount) FROM payments pr
        WHERE pr.type = 'refund'
          AND pr.status IN ('approved', 'pending')
          AND pr.description = p.description
          AND pr.id <> p.id
      ), 0)::int        AS "otrosRefunds",
      t.mp_access_token AS "mpAccessToken"
    FROM payments p
    JOIN tenants t ON t.id = p.tenant_id
    LEFT JOIN payments op ON p.description = 'Refund of ' || op.id::text
    WHERE p.type = 'refund'
      AND p.status = 'pending'
      -- Solo las que viajan por MercadoPago. Una devolución de una seña cobrada
      -- en efectivo o por transferencia también es una fila de refund pendiente,
      -- pero no tiene pago original en MP: sin este filtro el LEFT JOIN daría
      -- NULL, el worker loguearía un error CADA HORA y a las 24h mandaría un
      -- mail diciendo "revisá el reembolso en el panel de MercadoPago" por
      -- plata que nunca pasó por MercadoPago. Esas se saldan a mano en
      -- /caja/devoluciones.
      AND p.method = 'mercadopago'
      AND p.created_at < NOW() - INTERVAL '1 hour'
      AND t.mp_access_token IS NOT NULL
    ORDER BY p.created_at ASC
    LIMIT 100
  `

  let retried = 0
  let alerted = 0

  for (const row of rows) {
    if (!row.originalMpPaymentId) {
      logger.error('retry-refunds: original payment not found for refund', {
        module: 'retry-refunds',
        refundPaymentId: row.refundPaymentId,
      })
      // R1-E (rechazo review): sin pago original no hay CÓMO reintentar
      // (settleRefund necesita su mp_payment_id) — pero antes esto se
      // quedaba en el logger.error de arriba para siempre: cada corrida
      // horaria repetía el mismo log y el admin nunca se enteraba de que hay
      // un refund pendiente invisible. Mismo template/dedupe/umbral que el
      // resto de la cola — alertRefundStillPending no necesita
      // originalMpPaymentId, solo bookingId (opcional) para el contexto.
      const ageMs = Date.now() - new Date(row.createdAt).getTime()
      if (ageMs >= ALERT_AFTER_HOURS * 3_600_000) {
        const notificationIds = await alertRefundStillPending(row)
        if (notificationIds) {
          await Promise.all(notificationIds.map((id) => dispatchEmail(id)))
          alerted += 1
        }
      }
      continue
    }

    let settledApproved = false
    try {
      const prepared: PreparedRefund = {
        refundPaymentId: row.refundPaymentId,
        mpPaymentId: row.originalMpPaymentId,
        refundAmount: row.refundAmount,
        // Mismo criterio que `prepareRefund`: cubre el pago entero y no hay
        // otro refund contra ese pago. Sin el monto original no se asume
        // total — un parcial de más es peor que un reintento que falla.
        isTotal:
          row.originalAmount !== null &&
          row.otrosRefunds === 0 &&
          row.refundAmount === row.originalAmount,
      }
      const gateway = resolveTenantGateway(row.tenantId, row.mpAccessToken)
      const result = await settleRefund(prepared, gateway, row.tenantId)
      if (result.status === 'approved') {
        settledApproved = true
        retried += 1
        track.payment('payment.refund.retry_succeeded', {
          tenantId: row.tenantId,
          paymentId: row.refundPaymentId,
          bookingId: row.bookingId ?? undefined,
        })
      }
    } catch (err) {
      // `describeMpError`, no `err.message`: el gateway envuelve el error del SDK
      // y el mensaje de afuera lo escribimos nosotros ("Failed to refund MP
      // payment <id>"), que no distingue una cuenta sin saldo de un token
      // vencido. El motivo real vive en el `cause` anidado.
      logger.error('retry-refunds: settle failed', {
        module: 'retry-refunds',
        refundPaymentId: row.refundPaymentId,
        tenantId: row.tenantId,
        error: describeMpError(err),
      })
    }

    if (settledApproved) continue

    const ageMs = Date.now() - new Date(row.createdAt).getTime()
    if (ageMs < ALERT_AFTER_HOURS * 3_600_000) continue

    const notificationIds = await alertRefundStillPending(row)
    if (notificationIds) {
      await Promise.all(notificationIds.map((id) => dispatchEmail(id)))
      alerted += 1
    }
  }

  if (retried > 0 || alerted > 0) {
    logger.info('retry-refunds run summary', { module: 'retry-refunds', retried, alerted })
  }

  return { retried, alerted }
}

/**
 * Returns the enqueued notification ids, or `null` if an alert for this
 * `refundPaymentId` was already sent in a previous run (idempotency check
 * against `notifications.content->>'refundPaymentId'`).
 */
async function alertRefundStillPending(row: PendingRefundRow): Promise<string[] | null> {
  return withTenantContext(row.tenantId, async (tx) => {
    const already = await tx.execute(drizzleSql`
      SELECT id FROM notifications
      WHERE template_name = ${ALERT_TEMPLATE}
        AND content ->> 'refundPaymentId' = ${row.refundPaymentId}
      LIMIT 1
    `)
    if ((already as unknown[]).length > 0) return null

    const ctxRows = row.bookingId
      ? await tx.execute(drizzleSql`
          SELECT c.name AS court_name, b.date::text AS date
          FROM bookings b
          JOIN courts c ON c.id = b.court_id
          WHERE b.id = ${row.bookingId}
          LIMIT 1
        `)
      : []
    const ctx = (ctxRows as unknown as Array<{ court_name: string; date: string }>)[0]

    return enqueueTenantOwnerNotification(
      {
        tenantId: row.tenantId,
        templateName: ALERT_TEMPLATE,
        content: {
          refundPaymentId: row.refundPaymentId,
          bookingId: row.bookingId,
          amountArs: formatArs(row.refundAmount),
          courtName: ctx?.court_name,
          date: ctx?.date ? ctx.date.slice(0, 10).split('-').reverse().join('/') : undefined,
        },
        triggerEvent: 'payment.refund.retry_exhausted',
      },
      tx,
    )
  })
}

export async function registerRetryRefundsWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_RETRY_PENDING_REFUNDS, '0 * * * *', {})
  await boss.work(QUEUE_RETRY_PENDING_REFUNDS, CRON_WORK_OPTIONS, async () => {
    await retryPendingRefunds()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RETRY_PENDING_REFUNDS })
}
