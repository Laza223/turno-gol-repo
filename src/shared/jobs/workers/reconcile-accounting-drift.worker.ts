import type PgBoss from 'pg-boss'
import type { Sql } from 'postgres'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import {
  runAccountingReconciliation,
  type DriftFinding,
} from '@/modules/payments/reconciliation.service'
import { CRON_WORK_OPTIONS, QUEUE_RECONCILE_ACCOUNTING_DRIFT } from '../definitions'
import { track } from '@/shared/observability'
import { captureMessage } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'

/** `resourceType='booking'` → el resourceId ES el bookingId; si no, buscarlo en metadata. */
function extractBookingId(finding: DriftFinding): string | undefined {
  if (finding.resourceType === 'booking') return finding.resourceId
  const fromMetadata = finding.metadata.bookingId
  return typeof fromMetadata === 'string' ? fromMetadata : undefined
}

/**
 * Dedup entre corridas del cron (hallazgo del verificador adversarial, misma
 * clase de bug que `hasKnownLocalRefund` en payment.service.ts:288 — alert
 * fatigue). El worker corre cada hora: sin este guard, un drift que sigue
 * sin resolverse escribe una fila NUEVA en `audit_logs` + cuenta para el
 * `captureMessage` agrupado de Sentry EN CADA CORRIDA, para siempre.
 *
 * Ventana de 20h (no 24h): un drift que sigue sin resolverse se re-alerta
 * como mucho ~1 vez por día calendario, sin que un cron levemente
 * desalineado quede siempre por debajo de 24h y nunca vuelva a disparar.
 * Fase 1: todavía no hay mecanismo de "resuelto manualmente", así que un
 * drift persistente sigue alertando cada ~20h a propósito.
 */
async function fetchRecentlyReportedKeys(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ resourceId: string; action: string }[]>`
    SELECT resource_id AS "resourceId", action
    FROM audit_logs
    WHERE action LIKE 'reconciliation.drift_%'
      AND created_at > NOW() - INTERVAL '20 hours'
  `
  return new Set(rows.map((r) => `${r.action}:${r.resourceId}`))
}

/**
 * Fase D4 §7 (RI #3), decisión de canal ya tomada por el dueño: Sentry
 * warning + `audit_logs` únicamente — sin email al dueño del complejo (el
 * tab "Actividad" de `/super-admin/tenants/[id]` ya lee `audit_logs`
 * genérico, visible sin UI nueva).
 *
 * Corre las 6 invariantes DB-local (reconciliation.service.ts), descarta los
 * findings ya reportados en las últimas 20h (fetchRecentlyReportedKeys,
 * dedup contra alert fatigue) y con los que quedan: escribe un audit_log por
 * finding (best-effort: un tenant con problema de contexto no debe tumbar el
 * sweep entero) y emite 1 `captureMessage` agrupado por invariante (no 1 por
 * finding — evita alert fatigue si un solo drift sistemático produce
 * cientos de filas).
 */
export async function runReconciliationSweep(): Promise<number> {
  const sql = getWorkerSql()
  const allFindings = await runAccountingReconciliation(sql)

  const recentlyReported = await fetchRecentlyReportedKeys(sql)
  const findings = allFindings.filter(
    (finding) =>
      !recentlyReported.has(`reconciliation.drift_${finding.invariant}:${finding.resourceId}`),
  )
  const dedupedCount = allFindings.length - findings.length

  for (const finding of findings) {
    try {
      await withTenantContext(finding.tenantId, (tx) =>
        insertSystemAuditLog(tx, {
          tenantId: finding.tenantId,
          action: `reconciliation.drift_${finding.invariant}`,
          resourceType: finding.resourceType,
          resourceId: finding.resourceId,
          metadata: finding.metadata,
        }),
      )
    } catch (err) {
      logger.error('reconciliation: failed to write audit log for finding', {
        module: 'reconcile-accounting-drift',
        invariant: finding.invariant,
        tenantId: finding.tenantId,
        resourceId: finding.resourceId,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    track.payment('payment.reconcile.drift_detected', {
      tenantId: finding.tenantId,
      bookingId: extractBookingId(finding),
    })
  }

  const byInvariant = new Map<string, DriftFinding[]>()
  for (const finding of findings) {
    const group = byInvariant.get(finding.invariant) ?? []
    group.push(finding)
    byInvariant.set(finding.invariant, group)
  }

  for (const [invariant, group] of byInvariant) {
    captureMessage(`reconciliation drift detected: ${invariant} (${group.length} filas)`, {
      level: 'warning',
      extra: { invariant, count: group.length, sample: group.slice(0, 10) },
    })
  }

  logger.info('reconciliation sweep complete', {
    module: 'reconcile-accounting-drift',
    total: allFindings.length,
    new: findings.length,
    deduped: dedupedCount,
    byInvariant: Object.fromEntries([...byInvariant.entries()].map(([k, v]) => [k, v.length])),
  })

  return findings.length
}

export async function registerReconcileAccountingDriftWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_RECONCILE_ACCOUNTING_DRIFT, '0 * * * *', {})
  await boss.work(QUEUE_RECONCILE_ACCOUNTING_DRIFT, CRON_WORK_OPTIONS, async () => {
    await runReconciliationSweep()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RECONCILE_ACCOUNTING_DRIFT })
}
