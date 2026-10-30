import type { PgBoss } from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { notifyOwnerPlanEvent } from '@/modules/notifications/push.service'
import { artTodayStr } from '@/shared/dates/art'
import {
  CANCELED_BLOCKED_DELETION_DAYS,
  CHURNED_DELETION_DAYS,
  transitionBlockedToChurned,
  transitionCanceledToBlocked,
  transitionPastDueToSuspended,
  transitionSuspendedToBlocked,
} from '@/modules/billing/lifecycle.service'
import {
  billingReason,
  loadActivePlan,
  plusPerCourtOf,
  subscriptionAmount,
} from '@/modules/billing/billing.service'
import type { BillingCycle } from '@/modules/billing/billing.types'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { ensurePlusFlagOn, expirePlusAccess } from '@/modules/billing/plus.service'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { MP_MOCK_ENABLED } from '@/modules/payments/mock-mp'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { CRON_WORK_OPTIONS, QUEUE_DUNNING_RETRY } from '../definitions'
import { logger } from '@/shared/lib/logger'

/** dd/mm/aaaa, el formato de fecha que usan el mail y el push de aviso de borrado. */
function ddmmyyyy(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

/**
 * Daily 13:00 ART sweep. Drives time-based escalations of the SaaS lifecycle.
 *
 * MP itself handles charge retries (day 0/2/5 cadence per doc4 §4); this sweep
 * only escalates state machine past day 7. Each per-tenant transition writes
 * an audit_log entry + enqueues a `subscription_*` notification. Pending
 * downgrades scheduled at `current_period_end` are applied here.
 *
 * The cross-tenant reads below (which tenants need escalating) run on the
 * service-role pool — a single query can't be scoped to one
 * `app.current_tenant_id` (Fable 5 P0). Each per-tenant write then opens its
 * own short, correctly tenant-scoped transaction instead of sharing one giant
 * tx across every tenant in the sweep.
 */

type TenantOwnerInfo = {
  tenantId: string
  tenantName: string
  ownerName: string | null
}

async function loadTenantOwners(tenantIds: string[]): Promise<TenantOwnerInfo[]> {
  if (tenantIds.length === 0) return []
  const sql = getWorkerSql()
  // Una sola query para todos los complejos morosos del barrido. Antes había un
  // SELECT por id — la "mejora futura" que el comentario de esta función venía
  // anotando. Sigue sin `Promise.all` a propósito: `getWorkerSql()` es una
  // conexión postgres-js compartida y no corre queries en paralelo.
  const rows = await sql<TenantOwnerInfo[]>`
    SELECT t.id AS "tenantId",
           t.name AS "tenantName",
           (
             SELECT su.first_name FROM tenant_staff_members tsm
             JOIN staff_users su ON su.id = tsm.staff_user_id
             WHERE tsm.tenant_id = t.id AND tsm.is_active = true LIMIT 1
           ) AS "ownerName"
    FROM tenants t
    WHERE t.id = ANY(${tenantIds}::uuid[])
  `
  return [...rows]
}

function ownerName(map: Map<string, TenantOwnerInfo>, tenantId: string): string {
  return map.get(tenantId)?.ownerName ?? 'Hola'
}

function tenantName(map: Map<string, TenantOwnerInfo>, tenantId: string): string {
  return map.get(tenantId)?.tenantName ?? '(complejo)'
}

export async function runDunningSweep(now: Date = new Date()): Promise<void> {
  const sql = getWorkerSql()

  // ─── 1. past_due → suspended (≥ 7d) ────────────────────────────────────
  const pastDueRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'past_due'
      AND dunning_started_at IS NOT NULL
      AND dunning_started_at <= NOW() - INTERVAL '7 days'
  `
  const pastDueIds = pastDueRows.map((r) => r.tenant_id)

  // ─── 2. suspended → blocked (≥ 14d) ────────────────────────────────────
  const suspendedRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'suspended'
      AND dunning_started_at IS NOT NULL
      AND dunning_started_at <= NOW() - INTERVAL '14 days'
  `
  const suspendedIds = suspendedRows.map((r) => r.tenant_id)

  // ─── 3. blocked → churned (≥ 90d) ──────────────────────────────────────
  const blockedRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'blocked'
      AND dunning_started_at IS NOT NULL
      AND dunning_started_at <= NOW() - INTERVAL '90 days'
  `
  const blockedIds = blockedRows.map((r) => r.tenant_id)

  // ─── 4. canceled & period_end < NOW → blocked ──────────────────────────
  const canceledRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'canceled' AND current_period_end < NOW()
  `
  const canceledIds = canceledRows.map((r) => r.tenant_id)

  // ─── 5. se aplica el cambio de canchas facturadas agendado ─────────────
  // Con precio por cancha (migr. 090/091) este barrido dejó de ser "el
  // downgrade de plan de vez en cuando" y pasó a ser el ÚNICO lugar donde el
  // monto de una suscripción que ya cobra se mueve: cada vez que un complejo
  // suma o saca una cancha, el cambio espera acá hasta el fin del período.
  const pendingItems = await sql<{ tenant_id: string; pendingBilledCourts: number }[]>`
    SELECT tenant_id, pending_billed_courts AS "pendingBilledCourts"
    FROM tenant_subscriptions
    WHERE pending_billed_courts IS NOT NULL
      AND pending_change_at IS NOT NULL
      AND pending_change_at <= NOW()
      AND status = 'active'
  `

  const dedupSet = new Set<string>()
  pastDueIds.forEach((id) => dedupSet.add(id))
  suspendedIds.forEach((id) => dedupSet.add(id))
  blockedIds.forEach((id) => dedupSet.add(id))
  canceledIds.forEach((id) => dedupSet.add(id))
  pendingItems.forEach((p) => dedupSet.add(p.tenant_id))
  const allIds: string[] = []
  dedupSet.forEach((id) => allIds.push(id))
  const owners = await loadTenantOwners(allIds)
  const ownerMap = new Map(owners.map((o) => [o.tenantId, o]))

  for (const id of pastDueIds) {
    try {
      await withTenantContext(id, async (tx) => {
        await transitionPastDueToSuspended(id, tx)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'subscription_suspended',
            triggerEvent: 'sweep.past_due_to_suspended',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
            },
          },
          tx,
        )
      })
      // Push al dueño junto al mail, ya commiteada la transición. Un ciclo de mora
      // pasa a `suspended` una vez por día como mucho: el día identifica el aviso.
      await notifyOwnerPlanEvent(id, { event: 'suspended' }, artTodayStr())
      logger.info('tenant transitioned past_due → suspended', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed past_due→suspended', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const id of suspendedIds) {
    try {
      await withTenantContext(id, async (tx) => {
        await transitionSuspendedToBlocked(id, tx)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'subscription_blocked',
            triggerEvent: 'sweep.suspended_to_blocked',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
            },
          },
          tx,
        )
      })
      await notifyOwnerPlanEvent(id, { event: 'blocked' }, artTodayStr())
      logger.info('tenant transitioned suspended → blocked', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed suspended→blocked', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const id of blockedIds) {
    try {
      const deletionDate = new Date(Date.now() + CHURNED_DELETION_DAYS * 86_400_000)
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await withTenantContext(id, async (tx) => {
        await transitionBlockedToChurned(id, tx)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'tenant_deletion_warning',
            triggerEvent: 'sweep.blocked_to_churned',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
              deletionDate: ddmmyyyy(deletionDate),
              daysRemaining: CHURNED_DELETION_DAYS,
            },
          },
          tx,
        )
      })
      await notifyOwnerPlanEvent(
        id,
        {
          event: 'deletion_warning',
          deletionDate: ddmmyyyy(deletionDate),
          daysRemaining: CHURNED_DELETION_DAYS,
        },
        artTodayStr(),
      )
      logger.info('tenant transitioned blocked → churned', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed blocked→churned', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const id of canceledIds) {
    try {
      const deletionDate = new Date(Date.now() + CANCELED_BLOCKED_DELETION_DAYS * 86_400_000)
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await withTenantContext(id, async (tx) => {
        await transitionCanceledToBlocked(id, tx)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'tenant_deletion_warning',
            triggerEvent: 'sweep.canceled_to_blocked',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
              deletionDate: ddmmyyyy(deletionDate),
              daysRemaining: CANCELED_BLOCKED_DELETION_DAYS,
            },
          },
          tx,
        )
      })
      await notifyOwnerPlanEvent(
        id,
        {
          event: 'deletion_warning',
          deletionDate: ddmmyyyy(deletionDate),
          daysRemaining: CANCELED_BLOCKED_DELETION_DAYS,
        },
        artTodayStr(),
      )
      logger.info('tenant transitioned canceled → blocked (period ended)', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed canceled→blocked', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const item of pendingItems) {
    try {
      // Secuencial a propósito, como los barridos de arriba: cada ítem es una
      // tx propia que además le pega a MercadoPago; en paralelo agotaría el pool
      // y dispararía N PUTs a MP a la vez.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await withTenantContext(item.tenant_id, async (tx) => {
        // Piso: nunca se aplica una baja por debajo de las canchas prendidas
        // HOY. Entre que el dueño agendó la baja y el cierre del período pudo
        // haber vuelto a prender canchas por un camino que no avisa (p. ej.
        // estando en mora), y aplicar el número agendado a ciegas lo dejaba
        // operando 5 canchas y pagando 3 para siempre.
        const updated = await tx.execute(drizzleSql`
          UPDATE tenant_subscriptions
          SET billed_courts = GREATEST(
                ${item.pendingBilledCourts}::int,
                (SELECT COUNT(*)::int FROM courts
                 WHERE tenant_id = ${item.tenant_id} AND status = 'online')
              ),
              pending_billed_courts = NULL,
              pending_plan_change = NULL,
              pending_change_at = NULL,
              updated_at = NOW()
          WHERE tenant_id = ${item.tenant_id} AND status = 'active'
          RETURNING mp_subscription_id, billing_cycle, billed_courts,
                    plus_enabled, plus_price_per_court_cents
        `)
        const row = (
          updated as unknown as Array<{
            mp_subscription_id: string | null
            billing_cycle: BillingCycle
            billed_courts: number
            plus_enabled: boolean
            plus_price_per_court_cents: number | null
          }>
        )[0]
        const appliedBilledCourts = row?.billed_courts ?? item.pendingBilledCourts
        await insertSystemAuditLog(tx, {
          tenantId: item.tenant_id,
          action: 'subscription.billed_courts_applied',
          resourceType: 'tenant_subscription',
          resourceId: item.tenant_id,
          metadata: {
            billedCourts: appliedBilledCourts,
            scheduled: item.pendingBilledCourts,
            raisedToOnlineCourts: appliedBilledCourts !== item.pendingBilledCourts,
          },
        })

        // Bug de plata: aplicar el cambio acá sólo movía la DB — el
        // preapproval de MP seguía cobrando el monto VIEJO. "MP último": si
        // esta llamada falla, la tx entera (UPDATE + audit) rollbackea y el
        // próximo tick del cron reintenta.
        // Modo mock (E2E/dev): `getBillingGateway()` NO honra MP_MOCK_ENABLED
        // —sólo lo hace `resolveTenantGateway`—, así que sin este guard
        // pegaría contra MP con el token vacío (mismo guard que
        // reconcile-subscriptions.worker.ts). El downgrade local se aplica
        // igual.
        if (row?.mp_subscription_id && !MP_MOCK_ENABLED) {
          const plan = await loadActivePlan(tx)
          // Plus sale de la fila que acaba de devolver el UPDATE: mover las
          // canchas no puede sacarle (ni ponerle) Plus al debito.
          const plusPerCourt = plusPerCourtOf(row)
          await getBillingGateway().updatePreapprovalAmount(
            row.mp_subscription_id,
            subscriptionAmount(plan, appliedBilledCourts, row.billing_cycle, plusPerCourt),
            { reason: billingReason(appliedBilledCourts, row.billing_cycle, plusPerCourt) },
          )
        }
      })
      logger.info('billed courts change applied', {
        module: 'dunning-retry',
        tenantId: item.tenant_id,
        billedCourts: item.pendingBilledCourts,
      })
    } catch (err) {
      logger.warn('failed billed courts change', {
        module: 'dunning-retry',
        tenantId: item.tenant_id,
        error: String(err),
      })
    }
  }

  // ─── 6. TurnoGol Plus: vence la baja agendada ───────────────────────────
  // SIN filtro de `status`: el caso tipico es `canceled` (la baja del plan se
  // lleva a Plus hasta el fin del periodo pago). Solo los que tienen
  // `plus_access_until`: un complejo con el bot prendido a mano por SQL (El
  // Vagon) nunca entra aca. `expirePlusAccess` revalida bajo lock.
  const expiringPlus = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE plus_enabled = false
      AND plus_access_until IS NOT NULL
      AND plus_access_until <= ${now.toISOString()}::timestamptz
    ORDER BY plus_access_until
    LIMIT 200
  `
  for (const { tenant_id: id } of expiringPlus) {
    try {
      // Secuencial: cada ítem abre una tx propia sobre el pool worker.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (await expirePlusAccess(id, now)) {
        logger.info('plus access expired', { module: 'dunning-retry', tenantId: id })
      }
    } catch (err) {
      logger.warn('failed plus access expiry', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  // ─── 7. TurnoGol Plus: cura el flag que no se pudo prender ──────────────
  // Plus ya esta cobrandose (`plus_enabled`) pero el override del bot no esta
  // en true: el interruptor commiteo el cobro y fallo al prender. Reparar es
  // idempotente (`ensurePlusFlagOn` relee bajo lock).
  const missingFlag = await sql<{ tenant_id: string }[]>`
    SELECT ts.tenant_id FROM tenant_subscriptions ts
    WHERE ts.plus_enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM feature_flags ff
        WHERE ff.key = ${BOT_FEATURE_FLAG}
          AND ff.tenant_id = ts.tenant_id
          AND ff.value = true
      )
    LIMIT 200
  `
  for (const { tenant_id: id } of missingFlag) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await ensurePlusFlagOn(id)
      logger.info('plus flag healed', { module: 'dunning-retry', tenantId: id })
    } catch (err) {
      logger.warn('failed plus flag heal', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }
}

export async function registerDunningRetryWorker(boss: PgBoss): Promise<void> {
  // 13:00 ART = 16:00 UTC.
  await boss.schedule(QUEUE_DUNNING_RETRY, '0 16 * * *', {})
  await boss.work(QUEUE_DUNNING_RETRY, CRON_WORK_OPTIONS, async () => {
    await runDunningSweep()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_DUNNING_RETRY })
}
