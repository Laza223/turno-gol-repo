import type { PgBoss } from 'pg-boss'
import { sql } from 'drizzle-orm'
import { getWorkerDb, getWorkerSql } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { notifyOwnerPlanEvent } from '@/modules/notifications/push.service'
import { SUBSCRIBED_TRIAL_GRACE_DAYS, TRIAL_ENDING_WARNING_DAYS } from '@/shared/constants'
import { transitionToFree, type FreeDowngradeOrigin } from '@/modules/billing/lifecycle.service'
import { CRON_WORK_OPTIONS, QUEUE_EXPIRE_TRIALS } from '../definitions'
import { logger } from '@/shared/lib/logger'

/**
 * Avisa a los complejos cuya prueba está por vencer, antes de que el barrido
 * de abajo los apague.
 *
 * Hasta ahora no se avisaba NADA: el complejo pasaba a `blocked` de un día
 * para el otro. Las plantillas `trial_ending`/`trial_welcome` existían pero
 * ningún `enqueueNotification` las referenciaba.
 *
 * Idempotencia: a diferencia del sweep de dunning —donde la notificación va
 * adentro de una transición de estado que por definición pasa una sola vez—
 * acá el complejo sigue en `trialing` antes y después de avisarle. El gate es
 * el `UPDATE ... WHERE trial_warning_days_sent IS NULL OR > umbral RETURNING`
 * (migr. 068): si afecta 0 filas, ese umbral ya se avisó y se saltea. Es un
 * compare-and-set atómico, mismo patrón que `handleUpgradeApproved` — no un
 * "leer y después escribir", que dejaría lugar a mandar dos veces el mismo
 * mail si dos corridas se pisan.
 *
 * Se elige el umbral más CHICO que todavía aplica (por eso
 * `TRIAL_ENDING_WARNING_DAYS` va ascendente). Recorrer de mayor a menor sería
 * un bug silencioso: a un complejo con 12 horas restantes le daría el umbral
 * de 7 —12 h ≤ 7 días es verdadero— y lo marcaría como avisado, con lo cual
 * jamás recibiría el último llamado.
 *
 * El umbral es sólo la marca de idempotencia; los días que dice el mail salen
 * de `days_left` real, así que si una corrida se saltea (cron caído) el que
 * tiene 4 días recibe "te quedan 4 días" bajo el umbral 7, no un número falso.
 */
async function warnEndingTrials(): Promise<void> {
  const readSql = getWorkerSql()
  // Copia ordenada: no se confía en el orden declarado de la constante, para
  // que agregar un umbral nuevo en el medio no rompa la elección en silencio.
  const ascendingThresholds = [...TRIAL_ENDING_WARNING_DAYS].sort((a, b) => a - b)
  const maxDays = ascendingThresholds[ascendingThresholds.length - 1]!

  // Sólo los que todavía NO vencieron: el que ya venció se apaga en la fase de
  // abajo y avisarle "te quedan N días" a esa altura sería mentira.
  // `owner_name` viene por LATERAL en la misma pasada: antes se resolvía con un
  // SELECT por tenant adentro de la transacción de cada aviso (`ownerFirstName`).
  const candidates = await readSql<
    {
      id: string
      name: string
      days_left: number
      warned: number | null
      owner_name: string | null
    }[]
  >`
    SELECT t.id,
           t.name,
           CEIL(EXTRACT(EPOCH FROM (t.trial_ends_at - NOW())) / 86400)::int AS days_left,
           t.trial_warning_days_sent AS warned,
           o.first_name AS owner_name
    FROM tenants t
    LEFT JOIN LATERAL (
      SELECT su.first_name
      FROM tenant_staff_members tsm
      JOIN staff_users su ON su.id = tsm.staff_user_id
      WHERE tsm.tenant_id = t.id AND tsm.is_active = true
      LIMIT 1
    ) o ON TRUE
    WHERE t.status = 'trialing'
      AND t.trial_ends_at IS NOT NULL
      AND t.trial_ends_at > NOW()
      AND t.trial_ends_at <= NOW() + (${maxDays} || ' days')::interval
  `

  if (candidates.length === 0) return

  const db = getWorkerDb()

  for (const t of candidates) {
    // Ascendente ⇒ el primero que matchea es el más chico que aplica.
    const threshold = ascendingThresholds.find(
      (d) => t.days_left <= d && (t.warned === null || t.warned > d),
    )
    if (threshold === undefined) continue

    try {
      const warned = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`
          UPDATE tenants
          SET trial_warning_days_sent = ${threshold}, updated_at = NOW()
          WHERE id = ${t.id}
            AND status = 'trialing'
            AND (trial_warning_days_sent IS NULL OR trial_warning_days_sent > ${threshold})
          RETURNING id
        `)
        if ((res as unknown as Array<{ id: string }>).length === 0) return false

        // `enqueueTenantOwnerNotification` lee tenant_staff_members. Corre en
        // el pool worker (BYPASSRLS), así que no necesita contexto de tenant.
        await enqueueTenantOwnerNotification(
          {
            tenantId: t.id,
            templateName: 'trial_ending',
            triggerEvent: 'sweep.trial_ending',
            content: {
              ownerName: t.owner_name ?? 'Hola',
              tenantName: t.name,
              daysLeft: Math.max(1, t.days_left),
            },
          },
          tx,
        )
        return true
      })
      // Push al dueño, junto al mail y ya commiteada la marca. El umbral es la
      // identidad del aviso: si pg-boss reentrega este sweep, la dedupeKey lo frena.
      if (warned) {
        await notifyOwnerPlanEvent(
          t.id,
          { event: 'trial_ending', daysLeft: Math.max(1, t.days_left) },
          String(threshold),
        )
      }
      logger.info('warned tenant about ending trial', {
        module: 'expire-trials',
        tenantId: t.id,
        daysLeft: t.days_left,
        threshold,
      })
    } catch (err) {
      logger.error('failed trial warning for tenant', {
        module: 'expire-trials',
        tenantId: t.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * Backfill del freemium (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md,
 * condición C4 del ADR: lo hace el worker, no la migración). Los complejos que el
 * lifecycle anterior dejó sin pagar pasan al plan gratis, SIN mail:
 *
 * - `suspended` sin `dunning_started_at`: la prueba vencida en solo lectura.
 * - `blocked` sin `scheduled_deletion_at`: prueba vencida o mora que terminó
 *   bloqueada. Los `blocked` con borrado agendado (baja voluntaria vieja) se
 *   quedan como están: eligieron irse con las reglas de entonces.
 *
 * Cuando ya no quede ninguno, la query no devuelve filas y esto es un no-op.
 */
async function moveLegacyUnpaidToFree(): Promise<void> {
  const readSql = getWorkerSql()
  const candidates = await readSql<{ id: string; status: 'suspended' | 'blocked' }[]>`
    SELECT t.id, t.status::text AS status
    FROM tenants t
    JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
    WHERE (t.status = 'suspended' AND ts.status = 'suspended' AND ts.dunning_started_at IS NULL)
       OR (t.status = 'blocked' AND ts.status = 'blocked' AND ts.scheduled_deletion_at IS NULL)
  `
  if (candidates.length === 0) return

  const db = getWorkerDb()
  for (const t of candidates) {
    const origin: FreeDowngradeOrigin =
      t.status === 'suspended' ? 'legacy_trial_read_only' : 'legacy_blocked'
    try {
      await db.transaction((tx) => transitionToFree(t.id, origin, tx))
      logger.info('legacy unpaid tenant moved to free', {
        module: 'expire-trials',
        tenantId: t.id,
        origin,
      })
    } catch (err) {
      logger.error('failed legacy move to free', {
        module: 'expire-trials',
        tenantId: t.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * Pasa al plan gratis (`free`) los tenants trialing con trial_ends_at vencido y
 * sincroniza su tenant_subscriptions + audit log (`transitionToFree`). Hasta
 * 2026-10-22 los pasaba a `blocked`, después a solo lectura; desde el freemium
 * siguen en el mapa con el plan gratis
 * (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md).
 *
 * La lectura de candidatos corre en el pool worker (BYPASSRLS, cross-tenant —
 * Fable 5 P0, no scopeable a un solo app.current_tenant_id). Cada tenant abre
 * su propia transacción corta (tenants + tenant_subscriptions + audit,
 * todo-o-nada) con try/catch propio — mismo patrón que dunning-retry.worker.ts
 * / data-retention-cleanup.worker.ts — así un blip de conexión o timeout de
 * lock en UN tenant no revierte a los demás tenants vencidos de la misma
 * corrida.
 *
 * Orden de las fases:
 * - Avisa primero a los que están por vencer (`warnEndingTrials`): si expirara
 *   primero, un complejo que cruzó la línea entre dos corridas quedaría en
 *   solo lectura sin haber recibido nunca el aviso.
 * - El backfill del lifecycle anterior (`moveLegacyUnpaidToFree`) no depende
 *   de las otras dos fases.
 */
export async function runExpireTrials(): Promise<void> {
  await warnEndingTrials()
  await moveLegacyUnpaidToFree()

  const readSql = getWorkerSql()
  // `owner_name` por LATERAL, igual que en `warnEndingTrials`: evita un SELECT
  // por tenant dentro de cada transacción de bloqueo.
  //
  // Un complejo con `mp_subscription_id` ya tocó "Activar plan": su primer
  // cobro sale el día en que vence la prueba, a la hora que MP disponga, y MP
  // reintenta si la tarjeta rebota. Se le dan `SUBSCRIBED_TRIAL_GRACE_DAYS`
  // antes de pasarlo a solo lectura; si el cobro entra en el medio,
  // `onPaymentApproved` lo pasa a `active` y deja de ser candidato. El id no
  // distingue un débito autorizado de un checkout que nunca se pagó: ese
  // segundo caso recibe el mismo margen y después pasa a solo lectura igual.
  const candidates = await readSql<{ id: string; name: string; owner_name: string | null }[]>`
    SELECT t.id, t.name, o.first_name AS owner_name
    FROM tenants t
    LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
    LEFT JOIN LATERAL (
      SELECT su.first_name
      FROM tenant_staff_members tsm
      JOIN staff_users su ON su.id = tsm.staff_user_id
      WHERE tsm.tenant_id = t.id AND tsm.is_active = true
      LIMIT 1
    ) o ON TRUE
    WHERE t.status = 'trialing'
      AND t.trial_ends_at IS NOT NULL
      AND t.trial_ends_at < NOW()
      AND (
        ts.mp_subscription_id IS NULL
        OR t.trial_ends_at < NOW() - (${SUBSCRIBED_TRIAL_GRACE_DAYS} || ' days')::interval
      )
  `

  if (candidates.length === 0) return

  const db = getWorkerDb()

  for (const t of candidates) {
    try {
      const expired = await db.transaction(async (tx) => {
        // Orden A de locks: tenant_subscriptions ANTES que tenants (ver Fase 0).
        // El estado se relee bajo lock: si entre la lectura y acá el cobro
        // entró (`onPaymentApproved` → `active`), la fila ya no es de este
        // barrido y no se toca.
        const fresh = await tx.execute(sql`
          SELECT status FROM tenant_subscriptions WHERE tenant_id = ${t.id} FOR UPDATE
        `)
        if ((fresh as unknown as Array<{ status: string }>)[0]?.status !== 'trialing') return false

        await transitionToFree(t.id, 'trial_expired', tx)

        // doc7 Flujo 7: día 31, el complejo se entera de que la prueba terminó
        // y de que sigue en TurnoGol con el plan gratis.
        await enqueueTenantOwnerNotification(
          {
            tenantId: t.id,
            templateName: 'trial_expired',
            triggerEvent: 'sweep.trial_expired',
            content: {
              ownerName: t.owner_name ?? 'Hola',
              tenantName: t.name,
            },
          },
          tx,
        )
        return true
      })
      // La prueba vence una sola vez por complejo: `dedupeId` fijo.
      if (expired) await notifyOwnerPlanEvent(t.id, { event: 'trial_expired' }, 'expired')
      logger.info('tenant trial expired, now on free plan', {
        module: 'expire-trials',
        tenantId: t.id,
        tenantName: t.name,
      })
    } catch (err) {
      logger.error('failed expire for tenant', {
        module: 'expire-trials',
        tenantId: t.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export async function registerExpireTrialsWorker(boss: PgBoss): Promise<void> {
  // 08:00 ART = 11:00 UTC (ART is UTC-3)
  await boss.schedule(QUEUE_EXPIRE_TRIALS, '0 11 * * *', {})
  await boss.work(QUEUE_EXPIRE_TRIALS, CRON_WORK_OPTIONS, async () => {
    await runExpireTrials()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_EXPIRE_TRIALS })
}
