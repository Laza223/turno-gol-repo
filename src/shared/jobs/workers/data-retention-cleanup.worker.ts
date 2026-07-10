import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getWorkerDb, getWorkerSql } from '@/shared/db/client'
import { QUEUE_DATA_RETENTION } from '../definitions'
import { logger } from '@/shared/lib/logger'

/**
 * Weekly Sun 07:00 ART. Hard-deletes child rows for tenants past their
 * `scheduled_deletion_at` and soft-anonymizes the tenants row (Ley 25.326
 * §16 right to erasure). Status transitions to `deleted`.
 *
 * Scope: any tenant with `scheduled_deletion_at IS NOT NULL AND <= NOW()`
 * regardless of source state (covers churned and voluntary canceled→blocked
 * paths). Already-deleted/active/trialing tenants are excluded.
 *
 * Order matters: the schema has a circular FK between bookings.payment_id and
 * payments.booking_id; bookings refer to courts/abonados; cash_flows refers
 * to bookings/products. Sequence is preserved per-tenant.
 *
 * Pool (TG-P0-RETENTION-02): several of the DELETEs below hit tables the
 * restricted app role (`turnogol_app`) cannot write to under RLS/GRANTs —
 * `feature_flags` has no write policy (015_feature_flags.sql, deliberate),
 * and `audit_logs`/`daily_cash_closes` have UPDATE/DELETE explicitly revoked
 * (037_turnogol_app_grants.sql, re-applying 008_revokes.sql). Under
 * `withTenantContext` (app pool) those statements throw, the whole per-tenant
 * transaction rolls back, and — before this fix — the per-tenant `catch` only
 * logged, so the weekly wipe silently did nothing since PR #30 restricted the
 * app pool. This worker is a cross-tenant sweep by nature (background job,
 * "Background jobs usan rol de servicio separado", CLAUDE.md) so it now runs
 * entirely on the service-role pool (`getWorkerDb`/`getWorkerSql`, bypasses
 * RLS by design). Every statement below still carries its own explicit
 * `WHERE tenant_id = ...` (or narrower) filter as defense in depth — RLS is
 * not the barrier here, the WHERE clause is.
 */

export async function runDataRetentionCleanup(): Promise<void> {
  const sql = getWorkerSql()

  const targets = await sql<{ id: string }[]>`
    SELECT id FROM tenants
    WHERE scheduled_deletion_at IS NOT NULL
      AND scheduled_deletion_at <= NOW()
      AND status NOT IN ('deleted', 'active', 'trialing')
  `
  const ids = targets.map((r) => r.id)
  if (ids.length === 0) return

  logger.info('wiping tenants', { module: 'data-retention', count: ids.length })

  const failures: Array<{ tenantId: string; error: string }> = []

  for (const tenantId of ids) {
    try {
      const db = getWorkerDb()
      await db.transaction(async (tx) => {
        // Disable user-level triggers + FK enforcement for this tx so we can
        // wipe rows that are otherwise immutable (terminal bookings, daily
        // cash closes) and break the bookings ↔ payments circular FK.
        // `session_replication_role = replica` is the standard Postgres knob
        // for whole-tenant wipes and only affects this transaction.
        await tx.execute(drizzleSql`SET LOCAL session_replication_role = 'replica'`)

        await tx.execute(drizzleSql`DELETE FROM notifications WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM tenant_player_bans WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM tenant_staff_members WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM daily_cash_closes WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM cash_flows WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM payments WHERE tenant_id = ${tenantId}`)
        // Tenant-scoped rows whose FK to tenants is ON DELETE CASCADE never
        // fires here (we soft-anonymize the tenants row instead of deleting it)
        // plus `reviews`, whose booking_id is a RESTRICT FK that the replica
        // role would otherwise leave dangling. Delete reviews before bookings.
        await tx.execute(drizzleSql`DELETE FROM reviews WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM push_subscriptions WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM player_favorites WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM feature_flags WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM bookings WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM abonados WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM products WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM courts WHERE tenant_id = ${tenantId}`)
        await tx.execute(drizzleSql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${tenantId}`)

        // Soft-anonymize tenants row. Preserves audit FKs in any external
        // tables (processed_webhooks has no tenant_id; not affected).
        await tx.execute(drizzleSql`
          UPDATE tenants
          SET status = 'deleted'::tenant_status,
              name = '[deleted]',
              description = NULL,
              logo_url = NULL,
              cover_url = NULL,
              address = '[deleted]',
              phone = '[deleted]',
              whatsapp = NULL,
              email = ('deleted-' || id::text || '@anon.local'),
              latitude = NULL,
              longitude = NULL,
              mp_access_token = NULL,
              mp_refresh_token = NULL,
              mp_user_id = NULL,
              mp_public_key = NULL,
              scheduled_deletion_at = NULL,
              updated_at = NOW()
          WHERE id = ${tenantId}
        `)
      })
      logger.info('wiped tenant', { module: 'data-retention', tenantId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Loud on purpose (TG-P0-RETENTION-02): this used to be a silent
      // log-and-continue, so the weekly Ley 25.326 wipe could fail forever
      // with nothing surfacing it. logger.error is picked up by the DLQ/
      // Sentry pipeline (see attachFailureHandlers, doc17), and we also
      // accumulate the failure below so the job itself fails at the end —
      // per-tenant errors don't abort the remaining tenants mid-loop, but the
      // overall pg-boss job comes out red/retryable if any tenant failed.
      logger.error('failed wipe for tenant', {
        module: 'data-retention',
        tenantId,
        stage: 'tenant-wipe-transaction',
        error: message,
      })
      failures.push({ tenantId, error: message })
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `data-retention wipe failed for ${failures.length}/${ids.length} tenant(s): ` +
        failures.map((f) => `${f.tenantId}: ${f.error}`).join('; '),
    )
  }
}

export async function registerDataRetentionCleanupWorker(boss: PgBoss): Promise<void> {
  // 07:00 ART Sun = 10:00 UTC Sun.
  await boss.schedule(QUEUE_DATA_RETENTION, '0 10 * * 0', {})
  await boss.work(QUEUE_DATA_RETENTION, async () => {
    await runDataRetentionCleanup()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_DATA_RETENTION })
}
