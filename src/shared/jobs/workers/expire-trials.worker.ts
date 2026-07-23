import type PgBoss from 'pg-boss'
import { sql } from 'drizzle-orm'
import { getWorkerDb, getWorkerSql } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { CRON_WORK_OPTIONS, QUEUE_EXPIRE_TRIALS } from '../definitions'
import { logger } from '@/shared/lib/logger'

/**
 * Mueve tenants trialing con trial_ends_at vencido a 'blocked' y sincroniza
 * su tenant_subscriptions + audit log. La lectura de candidatos corre en el
 * pool worker (BYPASSRLS, cross-tenant — Fable 5 P0, no scopeable a un solo
 * app.current_tenant_id). Cada tenant abre su propia transacción corta
 * (tenants + tenant_subscriptions + audit, todo-o-nada) con try/catch propio
 * — mismo patrón que dunning-retry.worker.ts / data-retention-cleanup.worker.ts —
 * así un blip de conexión o timeout de lock en UN tenant no revierte a los
 * demás tenants vencidos de la misma corrida.
 */
export async function runExpireTrials(): Promise<void> {
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
      logger.info('blocked tenant trial expired', { module: 'expire-trials', tenantId: t.id, tenantName: t.name })
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
