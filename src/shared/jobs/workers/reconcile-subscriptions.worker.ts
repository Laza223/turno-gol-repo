import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import type { Sql } from 'postgres'
import { getWorkerSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { MP_MOCK_ENABLED } from '@/modules/payments/mock-mp'
import {
  transitionPastDueToActive,
  transitionToActiveFromAny,
  transitionTrialingToActive,
} from '@/modules/billing/lifecycle.service'
import {
  buildSubscriptionChargeKey,
  decideSubscriptionReconcile,
  type LocalSubSnapshot,
} from '@/modules/billing/subscription-reconcile.service'
import type { BillingCycle, SubscriptionStatus } from '@/modules/billing/billing.types'
import {
  CRON_WORK_OPTIONS,
  QUEUE_RECONCILE_SUBSCRIPTIONS,
  RECONCILE_SUBSCRIPTIONS_SEND_OPTIONS,
} from '../definitions'
import { track } from '@/shared/observability'
import { captureMessage } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'

/**
 * Red de rescate de las suscripciones SaaS.
 *
 * `trialing → active` sólo ocurre cuando llega el aviso del cobro de MP
 * (`onPaymentApproved` → `transitionTrialingToActive`). Si ese aviso se pierde
 * —MP agota reintentos, deploy caído, o un bug lo rechaza— el complejo paga
 * todos los meses y para nosotros sigue en prueba; después `expire-trials` le
 * vence el trial y lo apaga. Para las señas de reserva ese seguro existe hace
 * rato (`reconcile-pending-payments.worker.ts`); para las suscripciones no
 * había nada, y el 2026-08-20 se cobraron $200 acreditando $100.
 *
 * DIFERENCIA CLAVE con el reconciliador de señas: ése RE-ACTÚA el evento
 * perdido con una clave sintética `reconcile-<mpPaymentId>`. Acá no alcanza. En
 * el caso real del 2026-08-20 el `mp_event_id` del cobro perdido YA ESTABA en
 * `processed_webhooks` —el evento llegó, se marcó procesado y no aplicó nada—,
 * así que un replay habría hecho no-op justo sobre el único caso a rescatar. Y
 * aunque la clave estuviera libre, replicar el evento extiende
 * `current_period_end` +1 ciclo cada vez que corre.
 *
 * Por eso este worker CONVERGE: le pregunta a MP el estado real y escribe el
 * período en ABSOLUTO (`next_payment_date` de MP), no en relativo. Correrlo N
 * veces deja la misma fila que correrlo una, y no le pregunta nada a
 * `processed_webhooks`.
 *
 * Diseño completo:
 * `docs/superpowers/specs/2026-08-20-reconcile-subscriptions-design.md`.
 */

type Candidate = {
  tenantId: string
  status: SubscriptionStatus
  billingCycle: BillingCycle
  mpSubscriptionId: string
  lastPaymentAt: Date | string | null
}

/** Núcleo: los dos estados donde vive un complejo que pagó y no se aplicó. */
const CORE_STATUSES: readonly SubscriptionStatus[] = ['trialing', 'past_due']
/** Rescate post-terminal. Ver `rescuePostTerminalSubscriptions`. */
const POST_TERMINAL_STATUSES: readonly SubscriptionStatus[] = ['suspended', 'blocked']
/** Ventana del rescate post-terminal: un `blocked` viejo no es un aviso perdido. */
const POST_TERMINAL_WINDOW_DAYS = 30

/**
 * Lectura cross-tenant ⇒ pool de servicio (BYPASSRLS). Una sola query no se
 * puede acotar a un `app.current_tenant_id` — mismo motivo que en
 * `dunning-retry.worker.ts`. Cada escritura de abajo abre después su propia
 * transacción correctamente scopeada.
 */
async function loadCandidates(
  sql: Sql,
  statuses: readonly SubscriptionStatus[],
  windowDays: number | null,
): Promise<Candidate[]> {
  return sql<Candidate[]>`
    SELECT ts.tenant_id          AS "tenantId",
           ts.status             AS "status",
           ts.billing_cycle      AS "billingCycle",
           ts.mp_subscription_id AS "mpSubscriptionId",
           ts.last_payment_at    AS "lastPaymentAt"
    FROM tenant_subscriptions ts
    WHERE ts.mp_subscription_id IS NOT NULL
      AND ts.status = ANY(${statuses as unknown as string[]}::subscription_status[])
      ${
        windowDays === null
          ? sql``
          : sql`AND ts.updated_at > NOW() - (${windowDays} || ' days')::interval`
      }
    ORDER BY ts.updated_at ASC
    LIMIT 200
  `
}

/**
 * Dedup de alertas, 20 h — calcado de `reconcile-accounting-drift.worker.ts`.
 *
 * Un desfasaje que nadie resuelve (el dueño canceló en el panel de MP y no nos
 * avisó) escribiría una fila de `audit_logs` y un evento de Sentry EN CADA
 * CORRIDA, para siempre. 20 h y no 24 para que un cron levemente corrido no
 * quede siempre por debajo del umbral y nunca vuelva a alertar.
 */
async function recentlyAlerted(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ resourceId: string }[]>`
    SELECT resource_id AS "resourceId"
    FROM audit_logs
    WHERE action = 'subscription.mp_desync'
      AND created_at > NOW() - INTERVAL '20 hours'
  `
  return new Set(rows.map((r) => r.resourceId))
}

/**
 * Relee la fila DENTRO de la transacción y con `FOR UPDATE`.
 *
 * No es paranoia: `dunning.service.ts` (`loadSub`) lockea con
 * `FOR UPDATE OF ts` y `billing.service.ts` (`loadSubForUpdate`) también. Si
 * este worker decidiera sobre la fila que leyó el barrido —sin lock, y con un
 * round trip a MP en el medio— un `reactivate()`/`cancel()` concurrente podría
 * cambiar `mp_subscription_id` o el `status` justo ahí. El 2026-08-20 hubo 5
 * `subscribe()` del mismo complejo en un día, así que la carrera no es
 * hipotética. Tomando el MISMO lock, los dos caminos se serializan.
 *
 * `FOR UPDATE` pelado y no `OF ts`: acá no hay JOIN con `plans`, así que no hay
 * ninguna fila global que se pueda lockear de más.
 */
async function lockSub(tx: DbTx, tenantId: string): Promise<Candidate | null> {
  const rows = (await tx.execute(drizzleSql`
    SELECT tenant_id          AS "tenantId",
           status             AS "status",
           billing_cycle      AS "billingCycle",
           mp_subscription_id AS "mpSubscriptionId",
           last_payment_at    AS "lastPaymentAt"
    FROM tenant_subscriptions
    WHERE tenant_id = ${tenantId}
    LIMIT 1
    FOR UPDATE
  `)) as unknown as Candidate[]
  return rows[0] ?? null
}

/** `tx.execute(sql)` crudo devuelve los timestamps como string, no como Date. */
function toDate(v: Date | string | null): Date | null {
  if (v === null) return null
  return v instanceof Date ? v : new Date(v)
}

/** Formato de los templates de mail: "15/05/2026". */
function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

async function alertDesync(tenantId: string, preapprovalId: string, reason: string): Promise<void> {
  await withTenantContext(tenantId, (tx) =>
    insertSystemAuditLog(tx, {
      tenantId,
      action: 'subscription.mp_desync',
      resourceType: 'tenant_subscription',
      resourceId: tenantId,
      metadata: { preapprovalId, reason },
    }),
  )
  captureMessage(`subscription desync with MercadoPago: ${reason}`, {
    level: 'warning',
    extra: { tenantId, preapprovalId, reason },
  })
  track.payment('payment.subscription.mp_desync', { tenantId, preapprovalId })
}

/**
 * El id del PAGO del último cobro aprobado de esta suscripción, para armar la
 * clave de idempotencia que comparte con el webhook.
 *
 * Sale de `searchPaymentsByReference` sobre la cuenta MASTER: MP propaga el
 * `external_reference` del preapproval (= tenantId) al pago — verificado en el
 * panel sobre la operación real 173833098759. El proraeo de un upgrade usa
 * `saas-upgrade:<tenantId>:<planId>` como referencia, así que una búsqueda por
 * el tenantId pelado no lo devuelve.
 *
 * Devuelve `null` si no se puede identificar con certeza el pago del
 * preapproval vigente. **Eso NO cancela la activación**: el worker sigue con su
 * guard de marca de agua, que es su idempotencia propia. La clave compartida es
 * una mejora sobre el camino del webhook, no una condición para rescatar a un
 * complejo que ya pagó — degradar acá tiene que ser inofensivo.
 */
async function findChargePaymentId(
  tenantId: string,
  preapprovalId: string,
): Promise<string | null> {
  try {
    const pagos = await getBillingGateway().searchPaymentsByReference(tenantId)
    const delPreapproval = pagos.filter(
      (p) => p.status === 'approved' && p.preapprovalId === preapprovalId && p.mpPaymentId !== '',
    )
    // `searchPaymentsByReference` pide `sort: date_created, criteria: desc`, así
    // que el primero es el más reciente — el que corresponde al último cobro.
    return delPreapproval[0]?.mpPaymentId ?? null
  } catch (err) {
    logger.warn('no se pudo buscar el pago del cobro; se sigue sin clave compartida', {
      module: 'reconcile-subscriptions',
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Reconcilia UNA suscripción. Devuelve true si la levantó.
 *
 * Fase SEARCH / fase PROCESS, igual que `mp-webhook.handler.ts`: los fetch a MP
 * ocurren FUERA de toda transacción. Meterlos adentro dejaría una conexión del
 * pool idle-in-transaction durante el round trip HTTP — el hallazgo D4-A1 que
 * ya se corrigió una vez en el camino del webhook; no se reintroduce acá.
 */
async function reconcileOne(cand: Candidate, alerted: Set<string>): Promise<boolean> {
  // ── Fase SEARCH: MP, sin ninguna transacción abierta ──────────────────────
  const remote = await getBillingGateway().getSubscriptionState(cand.mpSubscriptionId)

  if (remote === null) {
    if (!alerted.has(cand.tenantId)) {
      alerted.add(cand.tenantId)
      await alertDesync(cand.tenantId, cand.mpSubscriptionId, 'MP no reconoce el preapproval (404)')
    }
    return false
  }

  // La decisión se calcula dos veces a propósito: una acá, con la fila del
  // barrido, sólo para saber si hace falta el segundo viaje a MP; y otra
  // adentro de la transacción, sobre la fila lockeada, que es la que manda.
  const preliminar = decideSubscriptionReconcile(
    {
      status: cand.status,
      billingCycle: cand.billingCycle,
      mpSubscriptionId: cand.mpSubscriptionId,
      lastPaymentAt: toDate(cand.lastPaymentAt),
    },
    remote,
    cand.tenantId,
  )
  const chargePaymentId =
    preliminar.action === 'activate'
      ? await findChargePaymentId(cand.tenantId, cand.mpSubscriptionId)
      : null

  // ── Fase PROCESS: sólo DB, con la fila lockeada ───────────────────────────
  const outcome = await withTenantContext(cand.tenantId, async (tx) => {
    const fresh = await lockSub(tx, cand.tenantId)
    if (!fresh) return { activated: false, alert: null as string | null }

    // Cambió el preapproval entre el barrido y ahora (reactivate/cancel
    // concurrente): la respuesta de MP que tenemos en mano es sobre OTRO
    // preapproval. Mismo criterio que `preapprovalIdMatches` en dunning.
    if (fresh.mpSubscriptionId !== cand.mpSubscriptionId) {
      return { activated: false, alert: null }
    }

    const snapshot: LocalSubSnapshot = {
      status: fresh.status,
      billingCycle: fresh.billingCycle,
      mpSubscriptionId: fresh.mpSubscriptionId,
      lastPaymentAt: toDate(fresh.lastPaymentAt),
    }
    const decision = decideSubscriptionReconcile(snapshot, remote, cand.tenantId)

    // La alerta se devuelve y se emite DESPUÉS del commit: abre su propia
    // transacción de audit y toca Sentry, y que una alerta falle no debe
    // revertir nada de lo de acá.
    if (decision.action === 'alert') return { activated: false, alert: decision.reason }
    if (decision.action === 'noop') return { activated: false, alert: null }

    // Clave compartida con el webhook (D3): si el webhook ya aplicó ESTE cobro,
    // el INSERT no es fresco y salimos sin tocar nada. Cubre la ventana que el
    // guard de marca de agua no puede ver: el webhook llegando después de que
    // este worker ya escribió.
    if (chargePaymentId !== null) {
      const claim = (await tx.execute(drizzleSql`
        INSERT INTO processed_webhooks (mp_event_id, event_type, payload)
        VALUES (
          ${buildSubscriptionChargeKey(chargePaymentId)},
          'reconcile-subscriptions:charge',
          ${{ source: 'reconcile-subscriptions', preapprovalId: cand.mpSubscriptionId }}::jsonb
        )
        ON CONFLICT (mp_event_id) DO NOTHING
        RETURNING id
      `)) as unknown as Array<{ id: string }>
      if (claim.length === 0) return { activated: false, alert: null }
    }

    // Se reusan las transiciones del FSM (lifecycle.service.ts) en vez de un
    // UPDATE propio: son las dueñas del espejo a `tenants.status` + audit log, y
    // respetan el Orden A de locks (tenant_subscriptions antes que tenants).
    let template: 'subscription_activated' | 'subscription_renewed'
    if (fresh.status === 'trialing') {
      await transitionTrialingToActive(cand.tenantId, decision.periodStart, decision.periodEnd, tx)
      template = 'subscription_activated'
    } else if (fresh.status === 'past_due') {
      await transitionPastDueToActive(cand.tenantId, decision.paidAt, decision.periodEnd, tx)
      template = 'subscription_renewed'
    } else if (fresh.status === 'suspended' || fresh.status === 'blocked') {
      await transitionToActiveFromAny(cand.tenantId, decision.periodStart, decision.periodEnd, tx)
      template = 'subscription_renewed'
    } else {
      return { activated: false, alert: null }
    }

    // `transitionTrialingToActive` y `transitionToActiveFromAny` escriben
    // `last_payment_at = NOW()`, no la fecha de MP. No se toca el FSM por eso:
    // NOW() > last_charged_date siempre, así que el guard de marca de agua
    // sigue siendo correcto, sólo más conservador. La fecha real de MP igual
    // queda en el audit log de abajo, que es lo que mira una conciliación
    // hecha a mano.
    await insertSystemAuditLog(tx, {
      tenantId: cand.tenantId,
      action: 'subscription.reconciled',
      resourceType: 'tenant_subscription',
      resourceId: cand.tenantId,
      metadata: {
        from: fresh.status,
        preapprovalId: cand.mpSubscriptionId,
        mpPaymentId: chargePaymentId,
        mpLastChargedAt: decision.paidAt.toISOString(),
        mpChargedQuantity: remote.chargedQuantity,
        periodEnd: decision.periodEnd.toISOString(),
        reason: 'el aviso del cobro nunca aplicó',
      },
    })

    const info = (await tx.execute(drizzleSql`
      SELECT t.name AS "tenantName",
             (
               SELECT su.first_name FROM tenant_staff_members tsm
               JOIN staff_users su ON su.id = tsm.staff_user_id
               WHERE tsm.tenant_id = t.id AND tsm.is_active = true LIMIT 1
             ) AS "ownerName",
             (
               SELECT p.name FROM plans p
               JOIN tenant_subscriptions ts ON ts.plan_id = p.id
               WHERE ts.tenant_id = t.id
             ) AS "planName"
      FROM tenants t
      WHERE t.id = ${cand.tenantId}
      LIMIT 1
    `)) as unknown as Array<{
      tenantName: string
      ownerName: string | null
      planName: string | null
    }>

    const t = info[0]
    if (t) {
      await enqueueTenantOwnerNotification(
        {
          tenantId: cand.tenantId,
          templateName: template,
          triggerEvent: 'sweep.subscription_reconciled',
          content: {
            ownerName: t.ownerName ?? 'Hola',
            tenantName: t.tenantName,
            planName: t.planName ?? 'tu plan',
            periodEnd: formatDate(decision.periodEnd),
          },
        },
        tx,
      )
    }

    return { activated: true, alert: null }
  })

  if (outcome.alert !== null && !alerted.has(cand.tenantId)) {
    alerted.add(cand.tenantId)
    await alertDesync(cand.tenantId, cand.mpSubscriptionId, outcome.alert)
  }
  if (outcome.activated) {
    logger.info('subscription reconciled from MercadoPago', {
      module: 'reconcile-subscriptions',
      tenantId: cand.tenantId,
      from: cand.status,
    })
    track.payment('payment.subscription.reconciled', {
      tenantId: cand.tenantId,
      preapprovalId: cand.mpSubscriptionId,
    })
  }
  return outcome.activated
}

async function sweep(
  statuses: readonly SubscriptionStatus[],
  windowDays: number | null,
  alerted: Set<string>,
): Promise<number> {
  const candidates = await loadCandidates(getWorkerSql(), statuses, windowDays)

  let fixed = 0
  for (const cand of candidates) {
    try {
      // secuencial: `getWorkerSql()` es una conexión postgres-js compartida y no
      // corre queries en paralelo (mismo motivo que en dunning-retry.worker.ts).
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (await reconcileOne(cand, alerted)) fixed += 1
    } catch (err) {
      logger.error('failed subscription reconcile', {
        module: 'reconcile-subscriptions',
        tenantId: cand.tenantId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return fixed
}

/**
 * Rescate post-terminal (equivalente de ENS-16 en reconcile-pending-payments).
 *
 * El barrido núcleo sólo mira `trialing` y `past_due` — pero el desenlace de un
 * aviso perdido es justamente que `expire-trials` pase el complejo a `blocked`,
 * o que `dunning-retry` lo escale a `suspended`. Sin este segundo paso, el que
 * ya cayó por ese tobogán queda fuera de la red para siempre.
 *
 * Ventana de 30 días sobre `updated_at`: un `blocked` de hace un año no es un
 * aviso perdido, es un complejo que se fue.
 */
async function rescuePostTerminalSubscriptions(alerted: Set<string>): Promise<number> {
  const rescued = await sweep(POST_TERMINAL_STATUSES, POST_TERMINAL_WINDOW_DAYS, alerted)
  if (rescued > 0) {
    logger.info('rescued post-terminal subscriptions', {
      module: 'reconcile-subscriptions',
      count: rescued,
    })
  }
  return rescued
}

export async function reconcileSubscriptions(): Promise<number> {
  // Modo mock (E2E): `getBillingGateway()` NO honra MP_MOCK_ENABLED —sólo lo
  // hace `resolveTenantGateway`—, así que acá pegaría contra MP con el token
  // vacío. Hoy los workers no corren en la suite e2e; el guard existe para que
  // eso siga siendo verdad si algún día corren.
  if (MP_MOCK_ENABLED) return 0

  const alerted = await recentlyAlerted(getWorkerSql())

  const fixed = await sweep(CORE_STATUSES, null, alerted)
  if (fixed > 0) {
    logger.info('activated subscriptions via reconcile', {
      module: 'reconcile-subscriptions',
      count: fixed,
    })
  }

  return fixed + (await rescuePostTerminalSubscriptions(alerted))
}

export async function registerReconcileSubscriptionsWorker(boss: PgBoss): Promise<void> {
  // :20 y no en punto — reconcile-accounting-drift, retry-refunds y
  // onboarding-abandonment ya corren todos a las :00; separarlos es gratis.
  //
  // El cuarto argumento son los SendOptions: sin él pg-boss registra el cron con
  // retryLimit=0 y un 5xx de MP significa esperar hasta la hora siguiente. Este
  // barrido es idempotente por construcción, así que reintentar es seguro.
  await boss.schedule(
    QUEUE_RECONCILE_SUBSCRIPTIONS,
    '20 * * * *',
    {},
    RECONCILE_SUBSCRIPTIONS_SEND_OPTIONS,
  )
  await boss.work(QUEUE_RECONCILE_SUBSCRIPTIONS, CRON_WORK_OPTIONS, async () => {
    await reconcileSubscriptions()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RECONCILE_SUBSCRIPTIONS })
}
