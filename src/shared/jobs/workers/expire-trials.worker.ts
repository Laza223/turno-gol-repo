import type PgBoss from 'pg-boss'
import { sql } from 'drizzle-orm'
import { getWorkerDb, getWorkerSql, type DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { TRIAL_ENDING_WARNING_DAYS } from '@/shared/constants'
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
  const candidates = await readSql<
    { id: string; name: string; days_left: number; warned: number | null }[]
  >`
    SELECT id,
           name,
           CEIL(EXTRACT(EPOCH FROM (trial_ends_at - NOW())) / 86400)::int AS days_left,
           trial_warning_days_sent AS warned
    FROM tenants
    WHERE status = 'trialing'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at > NOW()
      AND trial_ends_at <= NOW() + (${maxDays} || ' days')::interval
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
      await db.transaction(async (tx) => {
        const res = await tx.execute(sql`
          UPDATE tenants
          SET trial_warning_days_sent = ${threshold}, updated_at = NOW()
          WHERE id = ${t.id}
            AND status = 'trialing'
            AND (trial_warning_days_sent IS NULL OR trial_warning_days_sent > ${threshold})
          RETURNING id
        `)
        if ((res as unknown as Array<{ id: string }>).length === 0) return

        // `enqueueTenantOwnerNotification` lee tenant_staff_members. Corre en
        // el pool worker (BYPASSRLS), así que no necesita contexto de tenant.
        await enqueueTenantOwnerNotification(
          {
            tenantId: t.id,
            templateName: 'trial_ending',
            triggerEvent: 'sweep.trial_ending',
            content: {
              ownerName: await ownerFirstName(tx, t.id),
              tenantName: t.name,
              daysLeft: Math.max(1, t.days_left),
            },
          },
          tx,
        )
      })
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

/** Nombre de pila del primer staff activo, para encabezar el mail. */
async function ownerFirstName(tx: DbTx, tenantId: string): Promise<string> {
  const rows = (await tx.execute(sql`
    SELECT su.first_name
    FROM tenant_staff_members tsm
    JOIN staff_users su ON su.id = tsm.staff_user_id
    WHERE tsm.tenant_id = ${tenantId} AND tsm.is_active = true
    LIMIT 1
  `)) as unknown as Array<{ first_name: string | null }>
  return rows[0]?.first_name ?? 'Hola'
}

/**
 * Mueve tenants trialing con trial_ends_at vencido a 'blocked' y sincroniza
 * su tenant_subscriptions + audit log. La lectura de candidatos corre en el
 * pool worker (BYPASSRLS, cross-tenant — Fable 5 P0, no scopeable a un solo
 * app.current_tenant_id). Cada tenant abre su propia transacción corta
 * (tenants + tenant_subscriptions + audit, todo-o-nada) con try/catch propio
 * — mismo patrón que dunning-retry.worker.ts / data-retention-cleanup.worker.ts —
 * así un blip de conexión o timeout de lock en UN tenant no revierte a los
 * demás tenants vencidos de la misma corrida.
 *
 * Antes de expirar, avisa a los que están por vencer (`warnEndingTrials`). El
 * orden importa: si expirara primero, un complejo que cruzó la línea entre dos
 * corridas quedaría apagado sin haber recibido nunca el aviso.
 */
export async function runExpireTrials(): Promise<void> {
  await warnEndingTrials()

  const readSql = getWorkerSql()
  const candidates = await readSql<{ id: string; name: string }[]>`
    SELECT id, name FROM tenants
    WHERE status = 'trialing'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < NOW()
  `

  if (candidates.length === 0) return

  const db = getWorkerDb()

  for (const t of candidates) {
    try {
      await db.transaction(async (tx) => {
        // Orden A de locks: tenant_subscriptions ANTES que tenants (ver Fase 0).
        const res = await tx.execute(sql`
          UPDATE tenant_subscriptions
          SET status = 'blocked', updated_at = NOW()
          WHERE tenant_id = ${t.id} AND status = 'trialing'
          RETURNING id
        `)
        const updated = res as unknown as Array<{ id: string }>
        if (updated.length === 0) return

        await tx.execute(sql`
          UPDATE tenants
          SET status = 'blocked', updated_at = NOW()
          WHERE id = ${t.id} AND status = 'trialing'
        `)
        await insertSystemAuditLog(tx, {
          tenantId: t.id,
          action: 'tenant.trial_expired',
          resourceType: 'tenant',
          resourceId: t.id,
          metadata: { reason: 'trial_ends_at_passed' },
        })
      })
      logger.info('blocked tenant trial expired', {
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
