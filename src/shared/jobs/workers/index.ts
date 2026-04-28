import type PgBoss from 'pg-boss'
import { registerMpWebhookWorker } from './process-mp-webhook.worker'

/**
 * Register every worker on a running pg-boss instance. Add new registrations
 * here as queues are introduced (expire-pending-bookings, send-email, etc.).
 */
export async function registerAllWorkers(boss: PgBoss): Promise<void> {
  await registerMpWebhookWorker(boss)
}
