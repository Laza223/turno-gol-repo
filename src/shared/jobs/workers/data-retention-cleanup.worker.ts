import type PgBoss from 'pg-boss'
import { QUEUE_DATA_RETENTION } from '../definitions'

export async function registerDataRetentionCleanupWorker(boss: PgBoss): Promise<void> {
  // P18 — not implemented yet
  await boss.schedule(QUEUE_DATA_RETENTION, '0 7 * * 0', {})
  await boss.work(QUEUE_DATA_RETENTION, async () => {
    console.log('[data-retention] P18 — not implemented')
  })
  console.log(`[workers] registered ${QUEUE_DATA_RETENTION} (stub)`)
}
