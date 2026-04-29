import type PgBoss from 'pg-boss'
import { getSql } from '@/shared/db/client'
import { QUEUE_EXPIRE_TRIALS } from '../definitions'

export async function runExpireTrials(): Promise<void> {
  const sql = getSql()
  // Move trialing tenants whose trial_ends_at has passed to 'blocked'.
  // Also update the linked tenant_subscription to keep status in sync.
  const expired = await sql<{ id: string; name: string }[]>`
    UPDATE tenants
    SET status = 'blocked', updated_at = NOW()
    WHERE status = 'trialing'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < NOW()
    RETURNING id, name
  `

  if (expired.length === 0) return

  const ids = expired.map((r) => r.id)
  await sql`
    UPDATE tenant_subscriptions
    SET status = 'blocked', updated_at = NOW()
    WHERE tenant_id = ANY(${sql.array(ids)}::uuid[])
      AND status = 'trialing'
  `

  for (const t of expired) {
    console.log(`[expire-trials] blocked tenant ${t.id} (${t.name})`)
  }
}

export async function registerExpireTrialsWorker(boss: PgBoss): Promise<void> {
  // 08:00 ART = 11:00 UTC (ART is UTC-3)
  await boss.schedule(QUEUE_EXPIRE_TRIALS, '0 11 * * *', {})
  await boss.work(QUEUE_EXPIRE_TRIALS, async () => {
    await runExpireTrials()
  })
  console.log(`[workers] registered ${QUEUE_EXPIRE_TRIALS}`)
}
