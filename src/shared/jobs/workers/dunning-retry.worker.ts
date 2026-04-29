import type PgBoss from 'pg-boss'
import { QUEUE_DUNNING_RETRY } from '../definitions'

export async function registerDunningRetryWorker(boss: PgBoss): Promise<void> {
  // P18 — not implemented yet
  await boss.schedule(QUEUE_DUNNING_RETRY, '0 13 * * *', {})
  await boss.work(QUEUE_DUNNING_RETRY, async () => {
    console.log('[dunning-retry] P18 — not implemented')
  })
  console.log(`[workers] registered ${QUEUE_DUNNING_RETRY} (stub)`)
}
