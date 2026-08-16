import type PgBoss from 'pg-boss'
import { sql } from 'drizzle-orm'
import { getWorkerDb, getWorkerSql, type DbTx } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { WIZARD_STEPS } from '@/modules/onboarding/onboarding.steps'
import { track } from '@/shared/observability/breadcrumbs'
import { CRON_WORK_OPTIONS, QUEUE_ONBOARDING_ABANDONMENT } from '../definitions'
import { logger } from '@/shared/lib/logger'

/** doc10 §4 / plan de refactor §D: "abandona y vuelve" → email a las 24h. */
const ABANDONMENT_HOURS = 24

/**
 * Recordatorio de onboarding a medio terminar (plan de refactor §D/§I, Fase 7):
 * candidatos = tenants creados hace ≥24h que no cerraron el wizard y todavía no
 * recibieron el mail. Un solo aviso por tenant, para siempre — no es un
 * recordatorio recurrente.
 *
 * Idempotencia: mismo patrón compare-and-set que `warnEndingTrials`
 * (expire-trials.worker.ts) — el UPDATE que planta la marca
 * (`onboarding_abandoned_notified_at`) lleva su propio
 * `WHERE ... IS NULL` + `RETURNING`; si otra corrida ya ganó la carrera para
 * este tenant, esta no encuentra fila y no manda un segundo mail. La marca se
 * escribe DENTRO de la misma tx que encola la notificación — todo o nada, no
 * hay forma de marcar "avisado" sin haber encolado el mail.
 *
 * `onboarding.abandoned` (analytics) se emite recién DESPUÉS de que la tx
 * commiteó, no adentro: emitirlo antes contaría un abandono que el rollback
 * de un error posterior en la misma tx después deshace.
 */
export async function runOnboardingAbandonmentSweep(): Promise<void> {
  const readSql = getWorkerSql()
  const candidates = await readSql<{ id: string; name: string; onboarding_step: number | null }[]>`
    SELECT id, name, (settings->>'onboarding_step')::int AS onboarding_step
    FROM tenants
    WHERE COALESCE((settings->>'onboarding_completed')::boolean, false) = false
      AND settings->>'onboarding_abandoned_notified_at' IS NULL
      AND created_at <= NOW() - (${ABANDONMENT_HOURS} || ' hours')::interval
  `

  if (candidates.length === 0) return

  const db = getWorkerDb()

  for (const t of candidates) {
    const lastStep = t.onboarding_step ?? 1
    try {
      const claimed = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`
          UPDATE tenants
          SET settings = settings || jsonb_build_object('onboarding_abandoned_notified_at', NOW()::text),
              updated_at = NOW()
          WHERE id = ${t.id}
            AND settings->>'onboarding_abandoned_notified_at' IS NULL
          RETURNING id
        `)
        if ((res as unknown as Array<{ id: string }>).length === 0) return false

        const lastStepLabel = WIZARD_STEPS.find((s) => s.n === lastStep)?.label ?? 'Tu complejo'
        await enqueueTenantOwnerNotification(
          {
            tenantId: t.id,
            templateName: 'onboarding_abandoned',
            triggerEvent: 'sweep.onboarding_abandoned',
            content: {
              ownerName: await ownerFirstName(tx, t.id),
              tenantName: t.name,
              lastStepLabel,
            },
          },
          tx,
        )
        return true
      })

      if (claimed) {
        track.onboarding('onboarding.abandoned', { tenantId: t.id, lastStep })
        logger.info('reminded tenant about abandoned onboarding', {
          module: 'onboarding-abandonment',
          tenantId: t.id,
          lastStep,
        })
      }
    } catch (err) {
      logger.error('failed onboarding abandonment reminder for tenant', {
        module: 'onboarding-abandonment',
        tenantId: t.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/** Nombre de pila del primer staff activo, para encabezar el mail. Mismo helper que expire-trials.worker.ts. */
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

export async function registerOnboardingAbandonmentWorker(boss: PgBoss): Promise<void> {
  // Cada hora: la ventana de 24h no necesita más granularidad, y así se
  // mantiene fuera del polling latency-sensitive (CRON_WORK_OPTIONS).
  await boss.schedule(QUEUE_ONBOARDING_ABANDONMENT, '0 * * * *', {})
  await boss.work(QUEUE_ONBOARDING_ABANDONMENT, CRON_WORK_OPTIONS, async () => {
    await runOnboardingAbandonmentSweep()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_ONBOARDING_ABANDONMENT })
}
