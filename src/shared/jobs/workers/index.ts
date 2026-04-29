import type PgBoss from 'pg-boss'
import { registerMpWebhookWorker } from './process-mp-webhook.worker'
import { registerGenerateAbonadoSlotsWorker } from './generate-abonado-slots.worker'
import { registerSendEmailWorker } from './send-email.worker'
import { registerExpireTrialsWorker } from './expire-trials.worker'
import { registerAutoCompleteBookingsWorker } from './auto-complete-bookings.worker'
import { registerBookingReminderWorker } from './booking-reminder.worker'
import { registerDunningRetryWorker } from './dunning-retry.worker'
import { registerDataRetentionCleanupWorker } from './data-retention-cleanup.worker'

export async function registerAllWorkers(boss: PgBoss): Promise<void> {
  await registerMpWebhookWorker(boss)
  await registerGenerateAbonadoSlotsWorker(boss)
  await registerSendEmailWorker(boss)
  await registerExpireTrialsWorker(boss)
  await registerAutoCompleteBookingsWorker(boss)
  await registerBookingReminderWorker(boss)
  await registerDunningRetryWorker(boss)
  await registerDataRetentionCleanupWorker(boss)
}
