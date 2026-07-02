import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getSql, withTenantContext } from '@/shared/db/client'
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
 */

export async function runDataRetentionCleanup(): Promise<void> {
  const sql = getSql()

  const targets = await sql<{ id: string }[]>`
    SELECT id FROM tenants
    WHERE scheduled_deletion_at IS NOT NULL
      AND scheduled_deletion_at <= NOW()
      AND status NOT IN ('deleted', 'active', 'trialing')
  `
  const ids = targets.map((r) => r.id)
  if (ids.length === 0) return

  logger.info('wiping tenants', { module: 'data-retention', count: ids.length })

  for (const tenantId of ids) {
    try {
      // Every DELETE below hits an RLS+tenant-scoped table (Fable 5 P0) — must
      // run through withTenantContext, not the bare app pool, or each DELETE
      // matches 0 rows and the "wipe" silently does nothing.
      await withTenantContext(tenantId, async (tx) => {
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
      logger.error('failed wipe for tenant', { module: 'data-retention', tenantId, error: err instanceof Error ? err.message : String(err) })
    }
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
