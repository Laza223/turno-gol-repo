import type PgBoss from 'pg-boss'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { formatArs } from '@/modules/payments/payment.service'
import {
  enqueueTenantOwnerNotification,
  dispatchEmail,
} from '@/modules/notifications/notification.service'
import { CRON_WORK_OPTIONS, QUEUE_RETRY_PENDING_REFUNDS } from '../definitions'
import { logger } from '@/shared/lib/logger'

/**
 * A los 7 días se le recuerda al complejo cualquier devolución sin saldar.
 *
 * Una semana es cuando un jugador que espera plata empieza a hablar mal del
 * complejo, y es corto para el ciclo semanal de un complejo.
 */
const REMINDER_AFTER_DAYS = 7
const REMINDER_TEMPLATE = 'admin_refund_pending_reminder' as const

type StaleRefundRow = {
  refundPaymentId: string
  tenantId: string
  bookingId: string | null
  refundAmount: number
  daysPending: number
  playerName: string | null
  courtName: string | null
  date: string | null
}

/**
 * Recordatorio de devoluciones sin saldar, de CUALQUIER medio.
 *
 * ── Por qué este worker es la mitad de lo que era ───────────────────────────
 *
 * Hasta el 2026-08-24 este cron tenía un primer pase que reintentaba contra la
 * API de MercadoPago cada devolución `pending` de más de una hora. Ese pase se
 * eliminó junto con el reembolso automático (PR #203): MercadoPago deriva los
 * permisos del PRODUCTO de la aplicación y ninguna concede `payments:refunds`,
 * así que **cada reintento era un 403 garantizado** — 89 eventos de error por
 * día en producción, ruido permanente sobre un camino que el producto ya había
 * abandonado. Con él se fueron la alerta `admin_refund_failed` (avisaba de un
 * fallo que ahora no puede ocurrir) y el riesgo de devolver dos veces: la clave
 * de idempotencia nunca llegaba al SDK, así que si MP hubiera habilitado el
 * permiso sobre una devolución ya pagada a mano, el reintento la habría
 * mandado de nuevo.
 *
 * Queda el pase que sí sirve, y sirve para las devoluciones de todos los
 * medios: recordarle al complejo lo que debe.
 *
 * ── Por qué la cola se sigue llamando `retry-pending-refunds` ───────────────
 *
 * El nombre ya no describe lo que hace, y aun así no se cambia: `boss.schedule`
 * no borra el schedule viejo al registrar uno nuevo. Renombrar la cola dejaría
 * `retry-pending-refunds` agendada para siempre en producción, creando un job
 * por hora que ningún worker consume — se acumulan en estado `created` sin que
 * nada avise. Cambiarlo exige borrar la fila de `pgboss.schedule` en el mismo
 * deploy, y no vale ese riesgo por un nombre.
 */
export async function remindPendingRefunds(): Promise<{ reminded: number }> {
  // Barrido cross-tenant: necesita el pool de servicio, un rol restringido no
  // vería las devoluciones de otros complejos bajo RLS.
  const sql = getWorkerSql()
  const rows = await sql<StaleRefundRow[]>`
    SELECT p.id         AS "refundPaymentId",
           p.tenant_id  AS "tenantId",
           p.booking_id AS "bookingId",
           p.amount     AS "refundAmount",
           FLOOR(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400)::int AS "daysPending",
           CASE WHEN pl.id IS NULL THEN b.guest_name
                ELSE pl.first_name || ' ' || pl.last_name END AS "playerName",
           c.name       AS "courtName",
           b.date::text AS "date"
    FROM payments p
    LEFT JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN courts c ON c.id = b.court_id
    LEFT JOIN players pl ON pl.id = p.player_id
    WHERE p.type = 'refund'
      AND p.status = 'pending'
      AND p.created_at < NOW() - (${REMINDER_AFTER_DAYS} * INTERVAL '1 day')
      -- Dedupe: un solo recordatorio por devolución, para siempre. Insistir
      -- todos los días sería spam.
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.template_name = ${REMINDER_TEMPLATE}
          AND n.content ->> 'refundPaymentId' = p.id::text
      )
    ORDER BY p.created_at ASC
    LIMIT 100
  `

  let reminded = 0
  for (const row of rows) {
    const ids = await withTenantContext(row.tenantId, (tx) =>
      enqueueTenantOwnerNotification(
        {
          tenantId: row.tenantId,
          templateName: REMINDER_TEMPLATE,
          content: {
            refundPaymentId: row.refundPaymentId,
            bookingId: row.bookingId,
            amountArs: formatArs(row.refundAmount),
            daysPending: row.daysPending,
            ...(row.playerName ? { playerName: row.playerName } : {}),
            ...(row.courtName ? { courtName: row.courtName } : {}),
            ...(row.date ? { date: row.date.slice(0, 10).split('-').reverse().join('/') } : {}),
          },
          triggerEvent: 'payment.refund.still_pending',
        },
        tx,
      ),
    )
    await Promise.all(ids.map((id) => dispatchEmail(id)))
    reminded += 1
  }

  if (reminded > 0) {
    logger.info('pending-refunds reminder summary', { module: 'retry-refunds', reminded })
  }
  return { reminded }
}

export async function registerRetryRefundsWorker(boss: PgBoss): Promise<void> {
  // Diario, no horario. El cron corría cada hora por el reintento contra
  // MercadoPago, que necesitaba volver a intentar pronto; lo único que quedó
  // vive en una escala de días, así que 23 de cada 24 corridas eran un SELECT
  // que no podía encontrar nada nuevo. 12:00 UTC = 09:00 ART: el recordatorio
  // le llega al complejo a la mañana, no de madrugada.
  await boss.schedule(QUEUE_RETRY_PENDING_REFUNDS, '0 12 * * *', {})
  await boss.work(QUEUE_RETRY_PENDING_REFUNDS, CRON_WORK_OPTIONS, async () => {
    await remindPendingRefunds()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RETRY_PENDING_REFUNDS })
}
